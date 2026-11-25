import type { NormalizedRecord, RecordInput, RecordStatus } from "@dnsit/shared";
import { fqdnOf, normalizeFqdn } from "@dnsit/shared";
import type { AppContext } from "../context.js";
import { HttpError, ProviderError } from "../errors.js";
import {
  clearLinkRow,
  deleteRecordRow,
  getAccountRow,
  getAddressRow,
  getRecordRow,
  getZoneRow,
  insertAuditRow,
  listRecordRows,
  toNormalizedRecord,
  upsertRecordRow,
} from "../repo.js";
import type { ZoneRow } from "../repo.js";
import { assertWritable, providerForAccount } from "./accounts.js";
import { bindRecordToAddress, recomputeZoneDrift } from "./links.js";
import { ensureZoneRecords } from "./sync.js";

export interface RecordsPayload {
  records: NormalizedRecord[];
  syncedAt?: string;
  zoneName: string;
}

export async function loadZoneRecords(ctx: AppContext, zoneId: string, refresh: boolean): Promise<RecordsPayload> {
  const zone = getZoneRow(ctx.db, zoneId);
  if (!zone) throw new HttpError(404, "ZONE_NOT_FOUND", "域名不存在");
  const fresh = await ensureZoneRecords(ctx, zone, refresh);
  const records = listRecordRows(ctx.db, zoneId).map((row) => toNormalizedRecord(row, fresh.name));
  return { records, syncedAt: fresh.last_synced_at ?? undefined, zoneName: fresh.name };
}

export function cnameDependents(ctx: AppContext, zone: ZoneRow, fqdn: string): NormalizedRecord[] {
  const target = normalizeFqdn(fqdn);
  return listRecordRows(ctx.db, zone.id)
    .filter((row) => row.type.toUpperCase() === "CNAME" && normalizeFqdn(row.value) === target)
    .map((row) => toNormalizedRecord(row, zone.name));
}

function requireZone(ctx: AppContext, zoneId: string): ZoneRow {
  const zone = getZoneRow(ctx.db, zoneId);
  if (!zone) throw new HttpError(404, "ZONE_NOT_FOUND", "域名不存在");
  return zone;
}

function zoneRef(zone: ZoneRow) {
  return { name: zone.name, remoteZoneId: zone.remote_zone_id ?? undefined };
}

function auditFailure(ctx: AppContext, zone: ZoneRow, action: string, error: unknown, before?: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof ProviderError ? error.providerCode : "INTERNAL";
  const requestId = error instanceof ProviderError ? error.requestId : undefined;
  insertAuditRow(ctx.db, {
    accountId: zone.account_id,
    zoneId: zone.id,
    zoneName: zone.name,
    action,
    beforeJson: before,
    result: "FAILED",
    errorCode: code,
    errorMessage: message,
    requestId,
  });
  throw error;
}

function toInput(payload: RecordInput): RecordInput {
  return {
    name: payload.name,
    type: payload.type.toUpperCase(),
    value: payload.value,
    ttl: payload.ttl,
    line: payload.line,
    lineId: payload.lineId,
    priority: payload.priority,
    weight: payload.weight,
    status: payload.status,
    remark: payload.remark,
  };
}

export async function createRecord(ctx: AppContext, zoneId: string, payload: RecordInput): Promise<NormalizedRecord> {
  const zone = requireZone(ctx, zoneId);
  const account = getAccountRow(ctx.db, zone.account_id);
  if (!account) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "域名所属账号不存在");
  assertWritable(ctx, account);

  const input = toInput(payload);
  const provider = providerForAccount(ctx, account);
  let created;
  try {
    created = await provider.createRecord(zoneRef(zone), input);
  } catch (error) {
    auditFailure(ctx, zone, "RECORD_CREATE", error, null);
  }

  upsertRecordRow(ctx.db, zone.id, zone.provider, created);
  if (payload.hostAddressId) {
    try {
      bindRecordToAddress(ctx.db, zone.id, created.remoteId, payload.hostAddressId, created.value, created.type);
    } catch (error) {
      // 记录已创建成功，绑定失败时不让用户误以为整条操作失败
      recomputeZoneDrift(ctx.db, zone.id);
      throw error;
    }
  }
  insertAuditRow(ctx.db, {
    accountId: zone.account_id,
    zoneId: zone.id,
    zoneName: zone.name,
    action: "RECORD_CREATE",
    afterJson: created,
    result: "SUCCESS",
  });
  const row = getRecordRow(ctx.db, zone.id, created.remoteId)!;
  return toNormalizedRecord(row, zone.name);
}

export async function updateRecord(
  ctx: AppContext,
  zoneId: string,
  remoteId: string,
  payload: RecordInput & { beforeRemoteUpdatedAt?: string },
): Promise<NormalizedRecord> {
  const zone = requireZone(ctx, zoneId);
  const account = getAccountRow(ctx.db, zone.account_id);
  if (!account) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "域名所属账号不存在");
  assertWritable(ctx, account);

  const existing = getRecordRow(ctx.db, zone.id, remoteId);
  if (!existing) throw new HttpError(404, "RECORD_NOT_FOUND", "记录不存在或已被删除，请刷新");
  if (
    payload.beforeRemoteUpdatedAt &&
    existing.remote_updated_at &&
    payload.beforeRemoteUpdatedAt !== existing.remote_updated_at
  ) {
    throw new HttpError(409, "STALE_RECORD", "该记录已被修改，请刷新后重试");
  }

  const input = toInput(payload);
  const provider = providerForAccount(ctx, account);
  let updated;
  try {
    updated = await provider.updateRecord(zoneRef(zone), remoteId, input);
  } catch (error) {
    auditFailure(ctx, zone, "RECORD_UPDATE", error, toNormalizedRecord(existing, zone.name));
  }

  upsertRecordRow(ctx.db, zone.id, zone.provider, updated);
  if (payload.hostAddressId === null) {
    clearLinkRow(ctx.db, zone.id, remoteId);
  } else if (payload.hostAddressId) {
    bindRecordToAddress(ctx.db, zone.id, remoteId, payload.hostAddressId, updated.value, updated.type);
  }
  recomputeZoneDrift(ctx.db, zone.id);

  insertAuditRow(ctx.db, {
    accountId: zone.account_id,
    zoneId: zone.id,
    zoneName: zone.name,
    action: "RECORD_UPDATE",
    beforeJson: toNormalizedRecord(existing, zone.name),
    afterJson: updated,
    result: "SUCCESS",
  });
  return toNormalizedRecord(getRecordRow(ctx.db, zone.id, remoteId)!, zone.name);
}

export async function deleteRecord(
  ctx: AppContext,
  zoneId: string,
  remoteId: string,
  force: boolean,
): Promise<{ dependents: NormalizedRecord[] }> {
  const zone = requireZone(ctx, zoneId);
  const account = getAccountRow(ctx.db, zone.account_id);
  if (!account) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "域名所属账号不存在");
  assertWritable(ctx, account);

  const existing = getRecordRow(ctx.db, zone.id, remoteId);
  if (!existing) throw new HttpError(404, "RECORD_NOT_FOUND", "记录不存在或已被删除，请刷新");

  const record = toNormalizedRecord(existing, zone.name);
  const dependents = cnameDependents(ctx, zone, record.fqdn);
  if (dependents.length > 0 && !force) {
    throw new HttpError(409, "DEPENDENTS_EXIST", `有 ${dependents.length} 条 CNAME 记录指向它`, {
      extra: { dependents },
    });
  }

  const provider = providerForAccount(ctx, account);
  try {
    await provider.deleteRecord(zoneRef(zone), remoteId);
  } catch (error) {
    auditFailure(ctx, zone, "RECORD_DELETE", error, record);
  }

  deleteRecordRow(ctx.db, zone.id, remoteId);
  clearLinkRow(ctx.db, zone.id, remoteId);
  insertAuditRow(ctx.db, {
    accountId: zone.account_id,
    zoneId: zone.id,
    zoneName: zone.name,
    action: "RECORD_DELETE",
    beforeJson: record,
    result: "SUCCESS",
  });
  return { dependents };
}

export async function toggleRecordStatus(
  ctx: AppContext,
  zoneId: string,
  remoteId: string,
  status: RecordStatus,
): Promise<NormalizedRecord> {
  const zone = requireZone(ctx, zoneId);
  const account = getAccountRow(ctx.db, zone.account_id);
  if (!account) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "域名所属账号不存在");
  assertWritable(ctx, account);

  const existing = getRecordRow(ctx.db, zone.id, remoteId);
  if (!existing) throw new HttpError(404, "RECORD_NOT_FOUND", "记录不存在或已被删除，请刷新");

  const provider = providerForAccount(ctx, account);
  try {
    await provider.setStatus(zoneRef(zone), remoteId, status);
    const refreshed = await provider.getRecord(zoneRef(zone), remoteId);
    upsertRecordRow(ctx.db, zone.id, zone.provider, refreshed);
  } catch (error) {
    auditFailure(ctx, zone, "RECORD_TOGGLE", error, toNormalizedRecord(existing, zone.name));
  }

  insertAuditRow(ctx.db, {
    accountId: zone.account_id,
    zoneId: zone.id,
    zoneName: zone.name,
    action: "RECORD_TOGGLE",
    beforeJson: { status: existing.status },
    afterJson: { status },
    result: "SUCCESS",
  });
  return toNormalizedRecord(getRecordRow(ctx.db, zone.id, remoteId)!, zone.name);
}

export function recordDependents(ctx: AppContext, zoneId: string, remoteId: string): NormalizedRecord[] {
  const zone = requireZone(ctx, zoneId);
  const existing = getRecordRow(ctx.db, zone.id, remoteId);
  if (!existing) throw new HttpError(404, "RECORD_NOT_FOUND", "记录不存在");
  return cnameDependents(ctx, zone, fqdnOf(zone.name, existing.name));
}

export async function zoneLines(ctx: AppContext, zoneId: string) {
  const zone = requireZone(ctx, zoneId);
  const account = getAccountRow(ctx.db, zone.account_id);
  if (!account) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "域名所属账号不存在");
  const provider = providerForAccount(ctx, account);
  return provider.listLines(zoneRef(zone));
}

export async function zoneRecordTypes(ctx: AppContext, zoneId: string) {
  const zone = requireZone(ctx, zoneId);
  const account = getAccountRow(ctx.db, zone.account_id);
  if (!account) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "域名所属账号不存在");
  const provider = providerForAccount(ctx, account);
  return provider.listRecordTypes(zoneRef(zone));
}

export { getAddressRow };

import type { NormalizedRecord } from "@dnsit/shared";
import { isAddressType, normalizeIp, sameIp } from "@dnsit/shared";
import type { AppContext } from "../context.js";
import { HttpError, ProviderError } from "../errors.js";
import {
  getAccountRow,
  getAddressRow,
  getHostRow,
  getRecordRow,
  getZoneRow,
  insertAuditRow,
  listLinksByAddress,
  recordInputFromRow,
  toNormalizedRecord,
  updateAddressRow,
  upsertRecordRow,
} from "../repo.js";
import { providerForAccount } from "./accounts.js";
import { recomputeZoneDrift } from "./links.js";

export interface RolloutItem {
  zoneId: string;
  zoneName: string;
  remoteId: string;
  record: NormalizedRecord;
  before: string;
  after: string;
}

export interface RolloutSkip {
  zoneId: string;
  zoneName: string;
  remoteId: string;
  fqdn?: string;
  reason: "RECORD_GONE" | "DRIFTED" | "NOT_ADDRESS_RECORD";
}

export interface RolloutPlan {
  addressId: string;
  currentIp: string;
  newIp: string;
  affected: RolloutItem[];
  skipped: RolloutSkip[];
}

function requireAddress(ctx: AppContext, hostId: string, addressId: string) {
  if (!getHostRow(ctx.db, hostId)) throw new HttpError(404, "HOST_NOT_FOUND", "主机不存在");
  const address = getAddressRow(ctx.db, addressId);
  if (!address || address.host_id !== hostId) throw new HttpError(404, "ADDRESS_NOT_FOUND", "地址不存在");
  return address;
}

export function planAddressChange(ctx: AppContext, hostId: string, addressId: string, newIp: string): RolloutPlan {
  const address = requireAddress(ctx, hostId, addressId);
  const parsed = normalizeIp(newIp);
  if (!parsed.ok) throw new HttpError(422, "INVALID_IP", parsed.reason);
  if (sameIp(parsed.ip, address.ip)) throw new HttpError(422, "IP_UNCHANGED", "新 IP 与当前 IP 相同");

  const affected: RolloutItem[] = [];
  const skipped: RolloutSkip[] = [];

  for (const link of listLinksByAddress(ctx.db, addressId)) {
    const zone = getZoneRow(ctx.db, link.zone_id);
    const row = getRecordRow(ctx.db, link.zone_id, link.remote_record_id);
    if (!zone) continue;
    if (!row) {
      skipped.push({ zoneId: link.zone_id, zoneName: zone.name, remoteId: link.remote_record_id, reason: "RECORD_GONE" });
      continue;
    }
    const record = toNormalizedRecord(row, zone.name);
    if (!isAddressType(record.type)) {
      skipped.push({ zoneId: zone.id, zoneName: zone.name, remoteId: record.remoteId, fqdn: record.fqdn, reason: "NOT_ADDRESS_RECORD" });
      continue;
    }
    if (!sameIp(record.value, address.ip)) {
      skipped.push({ zoneId: zone.id, zoneName: zone.name, remoteId: record.remoteId, fqdn: record.fqdn, reason: "DRIFTED" });
      continue;
    }
    affected.push({
      zoneId: zone.id,
      zoneName: zone.name,
      remoteId: record.remoteId,
      record,
      before: record.value,
      after: parsed.ip,
    });
  }

  return { addressId, currentIp: address.ip, newIp: parsed.ip, affected, skipped };
}

export interface RolloutResult {
  succeeded: RolloutItem[];
  failed: Array<{ item: RolloutItem; message: string; providerCode?: string; requestId?: string }>;
  plan: RolloutPlan;
}

export async function applyAddressChange(
  ctx: AppContext,
  hostId: string,
  addressId: string,
  newIp: string,
  expectedCount: number,
): Promise<RolloutResult> {
  const plan = planAddressChange(ctx, hostId, addressId, newIp);
  if (plan.affected.length !== expectedCount) {
    throw new HttpError(409, "PLAN_CHANGED", `期间记录发生变化（预览时 ${expectedCount} 条，现在 ${plan.affected.length} 条），请重新预览`);
  }

  const succeeded: RolloutItem[] = [];
  const failed: RolloutResult["failed"] = [];
  const providers = new Map<string, ReturnType<typeof providerForAccount>>();
  const touchedZones = new Set<string>();

  for (const item of plan.affected) {
    const zone = getZoneRow(ctx.db, item.zoneId);
    const account = zone ? getAccountRow(ctx.db, zone.account_id) : undefined;
    if (!zone || !account) {
      failed.push({ item, message: "域名或账号已不存在" });
      continue;
    }
    if (ctx.config.readOnly || account.is_readonly) {
      failed.push({ item, message: "账号为只读，未执行" });
      continue;
    }
    const row = getRecordRow(ctx.db, item.zoneId, item.remoteId);
    if (!row) {
      failed.push({ item, message: "记录已被删除" });
      continue;
    }

    let provider = providers.get(account.id);
    if (!provider) {
      provider = providerForAccount(ctx, account);
      providers.set(account.id, provider);
    }

    try {
      const updated = await provider.updateRecord(
        { name: zone.name, remoteZoneId: zone.remote_zone_id ?? undefined },
        item.remoteId,
        { ...recordInputFromRow(row), value: plan.newIp },
      );
      upsertRecordRow(ctx.db, zone.id, zone.provider, updated);
      succeeded.push(item);
      touchedZones.add(zone.id);
      insertAuditRow(ctx.db, {
        accountId: account.id,
        zoneId: zone.id,
        zoneName: zone.name,
        action: "HOST_ROLLOUT",
        beforeJson: { value: item.before },
        afterJson: { value: item.after },
        result: "SUCCESS",
      });
    } catch (error) {
      const providerError = error instanceof ProviderError ? error : undefined;
      failed.push({
        item,
        message: error instanceof Error ? error.message : String(error),
        providerCode: providerError?.providerCode,
        requestId: providerError?.requestId,
      });
      insertAuditRow(ctx.db, {
        accountId: account.id,
        zoneId: zone.id,
        zoneName: zone.name,
        action: "HOST_ROLLOUT",
        beforeJson: { value: item.before },
        afterJson: { value: item.after },
        result: "FAILED",
        errorCode: providerError?.providerCode ?? "INTERNAL",
        errorMessage: error instanceof Error ? error.message : String(error),
        requestId: providerError?.requestId,
      });
    }
  }

  if (failed.length === 0) {
    updateAddressRow(ctx.db, addressId, { ip: plan.newIp });
  }
  for (const zoneId of touchedZones) recomputeZoneDrift(ctx.db, zoneId);

  insertAuditRow(ctx.db, {
    zoneName: "-",
    action: "HOST_ADDRESS_CHANGE",
    beforeJson: { addressId, ip: plan.currentIp },
    afterJson: { addressId, ip: plan.newIp, succeeded: succeeded.length, failed: failed.length },
    result: failed.length === 0 ? "SUCCESS" : succeeded.length === 0 ? "FAILED" : "PARTIAL",
  });

  return { succeeded, failed, plan };
}

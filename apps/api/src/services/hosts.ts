import type { HostDTO, HostUsageRow } from "@dnsit/shared";
import { normalizeIp } from "@dnsit/shared";
import type { AppContext } from "../context.js";
import { HttpError } from "../errors.js";
import {
  countLinksForAddress,
  deleteAddressRow,
  deleteHostRow,
  findHostByName,
  getAddressRow,
  getHostRow,
  hostUsageRows,
  insertAddressRow,
  insertAuditRow,
  insertHostRow,
  listAddressRows,
  listHostRows,
  listLinksByAddress,
  safeTags,
  toHostDTO,
  updateAddressRow,
  updateHostRow,
} from "../repo.js";
import type { HostRow } from "../repo.js";

interface HostStats {
  recordCount: number;
  driftCount: number;
}

function statsByHost(ctx: AppContext): Map<string, HostStats> {
  const rows = ctx.db
    .prepare(
      `SELECT ad.host_id AS host_id, COUNT(l.id) AS n,
              SUM(CASE WHEN l.drift <> 'NONE' THEN 1 ELSE 0 END) AS d
       FROM host_addresses ad
       LEFT JOIN record_host_links l ON l.host_address_id = ad.id
       GROUP BY ad.host_id`,
    )
    .all() as unknown as Array<{ host_id: string; n: number; d: number | null }>;
  const map = new Map<string, HostStats>();
  for (const row of rows) map.set(row.host_id, { recordCount: row.n ?? 0, driftCount: row.d ?? 0 });
  return map;
}

function toDTO(ctx: AppContext, row: HostRow, stats?: Map<string, HostStats>): HostDTO {
  const stat = stats?.get(row.id) ?? { recordCount: 0, driftCount: 0 };
  return toHostDTO(row, listAddressRows(ctx.db, row.id), stat.recordCount, stat.driftCount);
}

export function listHosts(ctx: AppContext, filters: { q?: string; tag?: string; status?: string }): HostDTO[] {
  const stats = statsByHost(ctx);
  const query = filters.q?.trim().toLowerCase();
  return listHostRows(ctx.db)
    .filter((row) => {
      if (filters.status && row.status !== filters.status) return false;
      const tags = safeTags(row.tags);
      if (filters.tag && !tags.includes(filters.tag)) return false;
      if (!query) return true;
      const addresses = listAddressRows(ctx.db, row.id);
      return (
        row.name.toLowerCase().includes(query) ||
        (row.remark ?? "").toLowerCase().includes(query) ||
        tags.some((tag) => tag.toLowerCase().includes(query)) ||
        addresses.some((address) => address.ip.includes(query))
      );
    })
    .map((row) => toDTO(ctx, row, stats));
}

export function getHost(ctx: AppContext, id: string): HostDTO {
  const row = getHostRow(ctx.db, id);
  if (!row) throw new HttpError(404, "HOST_NOT_FOUND", "主机不存在");
  return toDTO(ctx, row, statsByHost(ctx));
}

export function hostUsage(ctx: AppContext, id: string): HostUsageRow[] {
  if (!getHostRow(ctx.db, id)) throw new HttpError(404, "HOST_NOT_FOUND", "主机不存在");
  return hostUsageRows(ctx.db, id);
}

export function createHost(
  ctx: AppContext,
  payload: {
    name: string;
    remark?: string;
    tags: string[];
    status: "ACTIVE" | "INACTIVE";
    addresses: Array<{ ip: string; scope?: "PUBLIC" | "PRIVATE"; isPrimary?: boolean }>;
  },
): HostDTO {
  if (findHostByName(ctx.db, payload.name)) {
    throw new HttpError(409, "HOST_EXISTS", `主机名「${payload.name}」已存在`);
  }
  const normalized = payload.addresses.map((address) => {
    const parsed = normalizeIp(address.ip);
    if (!parsed.ok) throw new HttpError(422, "INVALID_IP", parsed.reason);
    return { ip: parsed.ip, version: parsed.version, scope: address.scope ?? "PUBLIC", isPrimary: address.isPrimary };
  });
  const primaryIndex = normalized.findIndex((address) => address.isPrimary);
  const row = insertHostRow(ctx.db, {
    name: payload.name,
    remark: payload.remark ?? null,
    tags: payload.tags,
    status: payload.status,
  });
  normalized.forEach((address, index) => {
    insertAddressRow(ctx.db, {
      hostId: row.id,
      ip: address.ip,
      version: address.version,
      scope: address.scope,
      isPrimary: primaryIndex === -1 ? index === 0 : index === primaryIndex,
    });
  });
  insertAuditRow(ctx.db, {
    zoneName: "-",
    action: "HOST_CREATE",
    afterJson: payload,
    result: "SUCCESS",
  });
  return getHost(ctx, row.id);
}

export function patchHost(
  ctx: AppContext,
  id: string,
  patch: { name?: string; remark?: string | null; tags?: string[]; status?: "ACTIVE" | "INACTIVE" },
): HostDTO {
  const row = getHostRow(ctx.db, id);
  if (!row) throw new HttpError(404, "HOST_NOT_FOUND", "主机不存在");
  if (patch.name && patch.name.toLowerCase() !== row.name_lower) {
    const clash = findHostByName(ctx.db, patch.name);
    if (clash) throw new HttpError(409, "HOST_EXISTS", `主机名「${patch.name}」已存在`);
  }
  updateHostRow(ctx.db, id, patch);
  insertAuditRow(ctx.db, {
    zoneName: "-",
    action: "HOST_UPDATE",
    beforeJson: { name: row.name, remark: row.remark, tags: safeTags(row.tags), status: row.status },
    afterJson: patch,
    result: "SUCCESS",
  });
  return getHost(ctx, id);
}

export function removeHost(ctx: AppContext, id: string, force: boolean): void {
  const row = getHostRow(ctx.db, id);
  if (!row) throw new HttpError(404, "HOST_NOT_FOUND", "主机不存在");
  const usage = hostUsageRows(ctx.db, id);
  const linkedRow = ctx.db
    .prepare(
      "SELECT COUNT(*) AS n FROM record_host_links WHERE host_address_id IN (SELECT id FROM host_addresses WHERE host_id = ?)",
    )
    .get(id) as { n: number };
  const linked = linkedRow?.n ?? 0;
  if (linked > 0 && !force) {
    throw new HttpError(409, "HOST_IN_USE", `该主机被 ${linked} 条记录引用`, { extra: { usage } });
  }
  ctx.db.prepare("DELETE FROM record_host_links WHERE host_address_id IN (SELECT id FROM host_addresses WHERE host_id = ?)").run(id);
  deleteHostRow(ctx.db, id);
  insertAuditRow(ctx.db, {
    zoneName: "-",
    action: "HOST_DELETE",
    beforeJson: { name: row.name },
    result: "SUCCESS",
  });
}

export function addHostAddress(
  ctx: AppContext,
  hostId: string,
  payload: { ip: string; scope?: "PUBLIC" | "PRIVATE"; isPrimary?: boolean },
): HostDTO {
  const row = getHostRow(ctx.db, hostId);
  if (!row) throw new HttpError(404, "HOST_NOT_FOUND", "主机不存在");
  const parsed = normalizeIp(payload.ip);
  if (!parsed.ok) throw new HttpError(422, "INVALID_IP", parsed.reason);
  const duplicate = listAddressRows(ctx.db, hostId).find((address) => address.ip === parsed.ip);
  if (duplicate) throw new HttpError(409, "ADDRESS_EXISTS", "该 IP 已属于这台主机");
  insertAddressRow(ctx.db, {
    hostId,
    ip: parsed.ip,
    version: parsed.version,
    scope: payload.scope ?? "PUBLIC",
    isPrimary: payload.isPrimary ?? false,
  });
  return getHost(ctx, hostId);
}

export function patchHostAddress(
  ctx: AppContext,
  hostId: string,
  addressId: string,
  patch: { ip?: string; scope?: "PUBLIC" | "PRIVATE"; isPrimary?: boolean },
): HostDTO {
  const address = getAddressRow(ctx.db, addressId);
  if (!address || address.host_id !== hostId) throw new HttpError(404, "ADDRESS_NOT_FOUND", "地址不存在");
  if (patch.ip !== undefined) {
    const parsed = normalizeIp(patch.ip);
    if (!parsed.ok) throw new HttpError(422, "INVALID_IP", parsed.reason);
    if (parsed.ip !== address.ip) {
      const linked = countLinksForAddress(ctx.db, addressId);
      if (linked > 0) {
        throw new HttpError(409, "USE_ROLLOUT", `该地址被 ${linked} 条记录引用，请通过「改 IP 并同步更新」处理`);
      }
      updateAddressRow(ctx.db, addressId, { ip: parsed.ip, version: parsed.version });
    }
  }
  if (patch.scope !== undefined || patch.isPrimary !== undefined) {
    updateAddressRow(ctx.db, addressId, { scope: patch.scope, isPrimary: patch.isPrimary });
  }
  return getHost(ctx, hostId);
}

export function removeHostAddress(ctx: AppContext, hostId: string, addressId: string): HostDTO {
  const address = getAddressRow(ctx.db, addressId);
  if (!address || address.host_id !== hostId) throw new HttpError(404, "ADDRESS_NOT_FOUND", "地址不存在");
  const linked = countLinksForAddress(ctx.db, addressId);
  if (linked > 0) throw new HttpError(409, "ADDRESS_IN_USE", `该地址被 ${linked} 条记录引用，请先解除绑定`);
  const remaining = listAddressRows(ctx.db, hostId).filter((item) => item.id !== addressId);
  if (remaining.length === 0) throw new HttpError(422, "LAST_ADDRESS", "主机至少需要保留一个地址");
  deleteAddressRow(ctx.db, addressId);
  if (!remaining.some((item) => item.is_primary === 1)) {
    updateAddressRow(ctx.db, remaining[0]!.id, { isPrimary: true });
  }
  return getHost(ctx, hostId);
}

export function lookupHostByIp(ctx: AppContext, ip: string): HostDTO[] {
  const parsed = normalizeIp(ip);
  if (!parsed.ok) return [];
  const rows = ctx.db
    .prepare("SELECT DISTINCT host_id FROM host_addresses WHERE ip = ?")
    .all(parsed.ip) as unknown as Array<{ host_id: string }>;
  return rows
    .map((row) => getHostRow(ctx.db, row.host_id))
    .filter((row): row is HostRow => Boolean(row))
    .map((row) => toDTO(ctx, row, statsByHost(ctx)));
}

export interface ImportPreviewRow {
  line: number;
  name: string;
  ips: string[];
  ok: boolean;
  errors: string[];
  exists: boolean;
}

export function previewHostImport(ctx: AppContext, text: string): ImportPreviewRow[] {
  const rows: ImportPreviewRow[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split(/[\s,]+/).filter(Boolean);
    const name = parts.shift() ?? "";
    const errors: string[] = [];
    if (!name) errors.push("缺少主机名");
    const ips: string[] = [];
    for (const candidate of parts) {
      const parsed = normalizeIp(candidate);
      if (!parsed.ok) errors.push(`${candidate}: ${parsed.reason}`);
      else ips.push(parsed.ip);
    }
    if (ips.length === 0) errors.push("至少需要一个合法 IP");
    const exists = Boolean(findHostByName(ctx.db, name));
    if (exists) errors.push("主机名已存在");
    rows.push({ line: index + 1, name, ips, ok: errors.length === 0, errors, exists });
  });
  return rows;
}

export function confirmHostImport(ctx: AppContext, text: string): { created: number; skipped: number } {
  const preview = previewHostImport(ctx, text);
  let created = 0;
  let skipped = 0;
  for (const row of preview) {
    if (!row.ok) {
      skipped += 1;
      continue;
    }
    createHost(ctx, {
      name: row.name,
      tags: [],
      status: "ACTIVE",
      addresses: row.ips.map((ip) => ({ ip })),
    });
    created += 1;
  }
  insertAuditRow(ctx.db, {
    zoneName: "-",
    action: "HOST_IMPORT",
    afterJson: { created, skipped },
    result: skipped > 0 ? "PARTIAL" : "SUCCESS",
  });
  return { created, skipped };
}

export function addressLinks(ctx: AppContext, addressId: string) {
  return listLinksByAddress(ctx.db, addressId);
}

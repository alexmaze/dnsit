import type {
  AccountSummary,
  DriftState,
  HostAddressDTO,
  HostDTO,
  HostUsageRow,
  NormalizedRecord,
  ProviderKind,
  RawRecord,
  RawZone,
  RecordInput,
  RecordStatus,
  ZoneSummary,
} from "@dnsit/shared";
import { fqdnOf, normalizeFqdn } from "@dnsit/shared";
import type { Db } from "./db.js";
import { bool, newId, nowIso } from "./db.js";

export interface AccountRow {
  id: string;
  provider: ProviderKind;
  name: string;
  access_key_id: string;
  secret_cipher: string;
  secret_iv: string;
  secret_tag: string;
  key_version: number;
  is_readonly: number;
  status: string;
  last_verified_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ZoneRow {
  id: string;
  account_id: string;
  provider: ProviderKind;
  name: string;
  remote_zone_id: string | null;
  record_count: number;
  grade_title: string | null;
  vip_end_at: string | null;
  status: string | null;
  default_ttl: number | null;
  last_synced_at: string | null;
  account_name?: string;
}

export interface RecordRow {
  id: string;
  zone_id: string;
  provider: ProviderKind;
  remote_record_id: string;
  name: string;
  type: string;
  value: string;
  ttl: number;
  line: string | null;
  line_id: string | null;
  priority: number | null;
  weight: number | null;
  status: string;
  remark: string | null;
  remote_updated_at: string | null;
  synced_at: string;
}

interface RecordWithHostRow extends RecordRow {
  link_drift: DriftState | null;
  link_address_id: string | null;
  host_ip: string | null;
  host_name: string | null;
  host_id: string | null;
}

export interface HostRow {
  id: string;
  name: string;
  name_lower: string;
  remark: string | null;
  tags: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface HostAddressRow {
  id: string;
  host_id: string;
  ip: string;
  version: number;
  scope: string;
  is_primary: number;
}

export interface LinkRow {
  id: string;
  zone_id: string;
  remote_record_id: string;
  host_address_id: string;
  drift: DriftState;
  created_at: string;
  checked_at: string;
}

export interface AuditRow {
  id: string;
  account_id: string | null;
  zone_id: string | null;
  zone_name: string;
  action: string;
  before_json: string | null;
  after_json: string | null;
  result: string;
  error_code: string | null;
  error_message: string | null;
  request_id: string | null;
  created_at: string;
}

// ── accounts ────────────────────────────────────────────
export function listAccountRows(db: Db): AccountRow[] {
  return db.prepare("SELECT * FROM accounts ORDER BY provider, name").all() as unknown as AccountRow[];
}

export function getAccountRow(db: Db, id: string): AccountRow | undefined {
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as unknown as AccountRow | undefined;
}

export function countZonesForAccount(db: Db, accountId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM zones WHERE account_id = ?").get(accountId) as { n: number };
  return row?.n ?? 0;
}

export function insertAccount(
  db: Db,
  data: { id: string; provider: ProviderKind; name: string; accessKeyId: string; sealed: { cipher: string; iv: string; tag: string; keyVersion: number }; readonly: boolean },
): AccountRow {
  const id = data.id;
  const ts = nowIso();
  db.prepare(
    `INSERT INTO accounts (id, provider, name, access_key_id, secret_cipher, secret_iv, secret_tag, key_version, is_readonly, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified', ?, ?)`,
  ).run(
    id,
    data.provider,
    data.name,
    data.accessKeyId,
    data.sealed.cipher,
    data.sealed.iv,
    data.sealed.tag,
    data.sealed.keyVersion,
    data.readonly ? 1 : 0,
    ts,
    ts,
  );
  return getAccountRow(db, id)!;
}

export function updateAccountRow(
  db: Db,
  id: string,
  patch: Partial<{
    name: string;
    access_key_id: string;
    secret_cipher: string;
    secret_iv: string;
    secret_tag: string;
    key_version: number;
    is_readonly: number;
    status: string;
    last_verified_at: string | null;
    last_error: string | null;
  }>,
): void {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  const assignments = keys.map((key) => `${key} = ?`).join(", ");
  const values = keys.map((key) => (patch as Record<string, unknown>)[key] as never);
  db.prepare(`UPDATE accounts SET ${assignments}, updated_at = ? WHERE id = ?`).run(...values, nowIso(), id);
}

export function deleteAccountRow(db: Db, id: string): void {
  db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
}

export function toAccountSummary(row: AccountRow, zoneCount: number, masked: string): AccountSummary {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    accessKeyMasked: masked,
    readonly: bool(row.is_readonly),
    status: row.status as AccountSummary["status"],
    lastVerifiedAt: row.last_verified_at ?? undefined,
    lastError: row.last_error ?? undefined,
    zoneCount,
  };
}

// ── zones ───────────────────────────────────────────────
export function listZoneRows(db: Db, accountId?: string): ZoneRow[] {
  const sql = `SELECT z.*, a.name AS account_name FROM zones z JOIN accounts a ON a.id = z.account_id
    ${accountId ? "WHERE z.account_id = ?" : ""} ORDER BY z.name`;
  const stmt = db.prepare(sql);
  return (accountId ? stmt.all(accountId) : stmt.all()) as unknown as ZoneRow[];
}

export function getZoneRow(db: Db, id: string): ZoneRow | undefined {
  return db
    .prepare("SELECT z.*, a.name AS account_name FROM zones z JOIN accounts a ON a.id = z.account_id WHERE z.id = ?")
    .get(id) as unknown as ZoneRow | undefined;
}

export function findZoneByName(db: Db, name: string): ZoneRow | undefined {
  return db.prepare("SELECT * FROM zones WHERE name = ? LIMIT 1").get(normalizeFqdn(name)) as unknown as ZoneRow | undefined;
}

export function upsertZone(db: Db, accountId: string, provider: ProviderKind, zone: RawZone): ZoneRow {
  const name = normalizeFqdn(zone.name);
  const existing = db
    .prepare("SELECT * FROM zones WHERE account_id = ? AND name = ?")
    .get(accountId, name) as unknown as ZoneRow | undefined;
  if (existing) {
    db.prepare(
      `UPDATE zones SET remote_zone_id = ?, record_count = ?, grade_title = ?, vip_end_at = ?, status = ?, default_ttl = ? WHERE id = ?`,
    ).run(
      zone.remoteZoneId ?? null,
      zone.recordCount ?? 0,
      zone.gradeTitle ?? null,
      zone.vipEndAt ?? null,
      zone.status ?? null,
      zone.defaultTtl ?? null,
      existing.id,
    );
    return getZoneRow(db, existing.id)!;
  }
  const id = newId("zone");
  db.prepare(
    `INSERT INTO zones (id, account_id, provider, name, remote_zone_id, record_count, grade_title, vip_end_at, status, default_ttl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    accountId,
    provider,
    name,
    zone.remoteZoneId ?? null,
    zone.recordCount ?? 0,
    zone.gradeTitle ?? null,
    zone.vipEndAt ?? null,
    zone.status ?? null,
    zone.defaultTtl ?? null,
  );
  return getZoneRow(db, id)!;
}

export function markZoneSynced(db: Db, zoneId: string, recordCount: number): void {
  db.prepare("UPDATE zones SET last_synced_at = ?, record_count = ? WHERE id = ?").run(nowIso(), recordCount, zoneId);
}

export function toZoneSummary(row: ZoneRow): ZoneSummary {
  return {
    id: row.id,
    accountId: row.account_id,
    accountName: row.account_name ?? "",
    provider: row.provider,
    name: row.name,
    recordCount: row.record_count,
    gradeTitle: row.grade_title ?? undefined,
    vipEndAt: row.vip_end_at ?? undefined,
    status: row.status ?? undefined,
    defaultTtl: row.default_ttl ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
  };
}

// ── records ─────────────────────────────────────────────
const RECORD_SELECT = `
SELECT r.*, l.drift AS link_drift, l.host_address_id AS link_address_id,
       a.ip AS host_ip, h.name AS host_name, h.id AS host_id
FROM records r
LEFT JOIN record_host_links l ON l.zone_id = r.zone_id AND l.remote_record_id = r.remote_record_id
LEFT JOIN host_addresses a ON a.id = l.host_address_id
LEFT JOIN hosts h ON h.id = a.host_id`;

export function listRecordRows(db: Db, zoneId: string): RecordWithHostRow[] {
  return db.prepare(`${RECORD_SELECT} WHERE r.zone_id = ? ORDER BY r.name, r.type`).all(zoneId) as unknown as RecordWithHostRow[];
}

export function getRecordRow(db: Db, zoneId: string, remoteId: string): RecordWithHostRow | undefined {
  return db
    .prepare(`${RECORD_SELECT} WHERE r.zone_id = ? AND r.remote_record_id = ?`)
    .get(zoneId, remoteId) as unknown as RecordWithHostRow | undefined;
}

export function replaceZoneRecords(db: Db, zoneId: string, provider: ProviderKind, records: RawRecord[]): void {
  const existing = db.prepare("SELECT remote_record_id FROM records WHERE zone_id = ?").all(zoneId) as unknown as Array<{ remote_record_id: string }>;
  const existingIds = new Set(existing.map((row) => row.remote_record_id));
  const ts = nowIso();
  for (const record of records) {
    existingIds.delete(record.remoteId);
    db.prepare(
      `INSERT INTO records (id, zone_id, provider, remote_record_id, name, type, value, ttl, line, line_id, priority, weight, status, remark, remote_updated_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(zone_id, remote_record_id) DO UPDATE SET
         name = excluded.name, type = excluded.type, value = excluded.value, ttl = excluded.ttl,
         line = excluded.line, line_id = excluded.line_id, priority = excluded.priority, weight = excluded.weight,
         status = excluded.status, remark = excluded.remark, remote_updated_at = excluded.remote_updated_at, synced_at = excluded.synced_at`,
    ).run(
      newId("rec"),
      zoneId,
      provider,
      record.remoteId,
      record.name,
      record.type,
      record.value,
      record.ttl,
      record.line ?? null,
      record.lineId ?? null,
      record.priority ?? null,
      record.weight ?? null,
      record.status,
      record.remark ?? null,
      record.remoteUpdatedAt ?? null,
      ts,
    );
  }
  for (const staleId of existingIds) {
    db.prepare("DELETE FROM records WHERE zone_id = ? AND remote_record_id = ?").run(zoneId, staleId);
  }
}

export function upsertRecordRow(db: Db, zoneId: string, provider: ProviderKind, record: RawRecord): void {
  db.prepare(
    `INSERT INTO records (id, zone_id, provider, remote_record_id, name, type, value, ttl, line, line_id, priority, weight, status, remark, remote_updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(zone_id, remote_record_id) DO UPDATE SET
       name = excluded.name, type = excluded.type, value = excluded.value, ttl = excluded.ttl,
       line = excluded.line, line_id = excluded.line_id, priority = excluded.priority, weight = excluded.weight,
       status = excluded.status, remark = excluded.remark, remote_updated_at = excluded.remote_updated_at, synced_at = excluded.synced_at`,
  ).run(
    newId("rec"),
    zoneId,
    provider,
    record.remoteId,
    record.name,
    record.type,
    record.value,
    record.ttl,
    record.line ?? null,
    record.lineId ?? null,
    record.priority ?? null,
    record.weight ?? null,
    record.status,
    record.remark ?? null,
    record.remoteUpdatedAt ?? null,
    nowIso(),
  );
}

export function deleteRecordRow(db: Db, zoneId: string, remoteId: string): void {
  db.prepare("DELETE FROM records WHERE zone_id = ? AND remote_record_id = ?").run(zoneId, remoteId);
}

export function toNormalizedRecord(row: RecordWithHostRow, zoneName: string): NormalizedRecord {
  const lineCode = row.provider === "tencent" ? (row.line ?? "默认") : (row.line ?? "default");
  return {
    id: `${row.zone_id}:${row.remote_record_id}`,
    zoneId: row.zone_id,
    remoteId: row.remote_record_id,
    name: row.name,
    fqdn: fqdnOf(zoneName, row.name),
    type: row.type,
    value: row.value,
    ttl: row.ttl,
    line: { code: lineCode, label: lineCode },
    lineId: row.line_id ?? undefined,
    priority: row.priority ?? undefined,
    weight: row.weight ?? undefined,
    status: row.status as RecordStatus,
    remark: row.remark ?? undefined,
    remoteUpdatedAt: row.remote_updated_at ?? undefined,
    host:
      row.link_address_id && row.host_id && row.host_name && row.host_ip
        ? {
            addressId: row.link_address_id,
            hostId: row.host_id,
            hostName: row.host_name,
            ip: row.host_ip,
            drift: (row.link_drift ?? "NONE") as DriftState,
          }
        : undefined,
  };
}

export function recordInputFromRow(row: RecordRow): RecordInput {
  return {
    name: row.name,
    type: row.type,
    value: row.value,
    ttl: row.ttl,
    line: row.line ?? undefined,
    lineId: row.line_id ?? undefined,
    priority: row.priority ?? undefined,
    weight: row.weight ?? undefined,
    status: row.status as RecordStatus,
    remark: row.remark ?? undefined,
  };
}

// ── hosts ───────────────────────────────────────────────
export function listHostRows(db: Db): HostRow[] {
  return db.prepare("SELECT * FROM hosts ORDER BY name_lower").all() as unknown as HostRow[];
}

export function getHostRow(db: Db, id: string): HostRow | undefined {
  return db.prepare("SELECT * FROM hosts WHERE id = ?").get(id) as unknown as HostRow | undefined;
}

export function findHostByName(db: Db, name: string): HostRow | undefined {
  return db.prepare("SELECT * FROM hosts WHERE name_lower = ?").get(name.trim().toLowerCase()) as unknown as HostRow | undefined;
}

export function insertHostRow(
  db: Db,
  data: { name: string; remark?: string | null; tags: string[]; status: string },
): HostRow {
  const id = newId("host");
  const ts = nowIso();
  db.prepare(
    "INSERT INTO hosts (id, name, name_lower, remark, tags, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, data.name, data.name.toLowerCase(), data.remark ?? null, JSON.stringify(data.tags), data.status, ts, ts);
  return getHostRow(db, id)!;
}

export function updateHostRow(
  db: Db,
  id: string,
  patch: { name?: string; remark?: string | null; tags?: string[]; status?: string },
): void {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?", "name_lower = ?");
    values.push(patch.name, patch.name.toLowerCase());
  }
  if (patch.remark !== undefined) {
    sets.push("remark = ?");
    values.push(patch.remark);
  }
  if (patch.tags !== undefined) {
    sets.push("tags = ?");
    values.push(JSON.stringify(patch.tags));
  }
  if (patch.status !== undefined) {
    sets.push("status = ?");
    values.push(patch.status);
  }
  if (sets.length === 0) return;
  values.push(nowIso(), id);
  db.prepare(`UPDATE hosts SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).run(...(values as never[]));
}

export function deleteHostRow(db: Db, id: string): void {
  db.prepare("DELETE FROM hosts WHERE id = ?").run(id);
}

export function listAddressRows(db: Db, hostId: string): HostAddressRow[] {
  return db
    .prepare("SELECT * FROM host_addresses WHERE host_id = ? ORDER BY is_primary DESC, ip")
    .all(hostId) as unknown as HostAddressRow[];
}

export function getAddressRow(db: Db, id: string): HostAddressRow | undefined {
  return db.prepare("SELECT * FROM host_addresses WHERE id = ?").get(id) as unknown as HostAddressRow | undefined;
}

export function findAddressesByIp(db: Db, ip: string): Array<HostAddressRow & { host_name: string }> {
  return db
    .prepare("SELECT a.*, h.name AS host_name FROM host_addresses a JOIN hosts h ON h.id = a.host_id WHERE a.ip = ?")
    .all(ip) as unknown as Array<HostAddressRow & { host_name: string }>;
}

export function insertAddressRow(
  db: Db,
  data: { hostId: string; ip: string; version: number; scope: string; isPrimary: boolean },
): HostAddressRow {
  if (data.isPrimary) db.prepare("UPDATE host_addresses SET is_primary = 0 WHERE host_id = ?").run(data.hostId);
  const id = newId("addr");
  db.prepare(
    "INSERT INTO host_addresses (id, host_id, ip, version, scope, is_primary) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, data.hostId, data.ip, data.version, data.scope, data.isPrimary ? 1 : 0);
  return getAddressRow(db, id)!;
}

export function updateAddressRow(
  db: Db,
  id: string,
  patch: { ip?: string; version?: number; scope?: string; isPrimary?: boolean },
): void {
  if (patch.isPrimary) {
    const current = getAddressRow(db, id);
    if (current) db.prepare("UPDATE host_addresses SET is_primary = 0 WHERE host_id = ?").run(current.host_id);
  }
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.ip !== undefined) sets.push("ip = ?"), values.push(patch.ip);
  if (patch.version !== undefined) sets.push("version = ?"), values.push(patch.version);
  if (patch.scope !== undefined) sets.push("scope = ?"), values.push(patch.scope);
  if (patch.isPrimary !== undefined) sets.push("is_primary = ?"), values.push(patch.isPrimary ? 1 : 0);
  if (sets.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE host_addresses SET ${sets.join(", ")} WHERE id = ?`).run(...(values as never[]));
}

export function deleteAddressRow(db: Db, id: string): void {
  db.prepare("DELETE FROM host_addresses WHERE id = ?").run(id);
}

export function countLinksForAddress(db: Db, addressId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM record_host_links WHERE host_address_id = ?").get(addressId) as { n: number };
  return row?.n ?? 0;
}

export function toHostDTO(row: HostRow, addresses: HostAddressRow[], recordCount = 0, driftCount = 0): HostDTO {
  return {
    id: row.id,
    name: row.name,
    remark: row.remark ?? undefined,
    tags: safeTags(row.tags),
    status: row.status as HostDTO["status"],
    addresses: addresses.map(
      (address): HostAddressDTO => ({
        id: address.id,
        ip: address.ip,
        version: address.version,
        scope: address.scope as HostAddressDTO["scope"],
        isPrimary: bool(address.is_primary),
      }),
    ),
    recordCount,
    driftCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function safeTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

// ── links ───────────────────────────────────────────────
export function getLinkRow(db: Db, zoneId: string, remoteId: string): LinkRow | undefined {
  return db
    .prepare("SELECT * FROM record_host_links WHERE zone_id = ? AND remote_record_id = ?")
    .get(zoneId, remoteId) as unknown as LinkRow | undefined;
}

export function setLinkRow(db: Db, zoneId: string, remoteId: string, addressId: string, drift: DriftState): void {
  const ts = nowIso();
  db.prepare(
    `INSERT INTO record_host_links (id, zone_id, remote_record_id, host_address_id, drift, created_at, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(zone_id, remote_record_id) DO UPDATE SET host_address_id = excluded.host_address_id,
       drift = excluded.drift, checked_at = excluded.checked_at`,
  ).run(newId("link"), zoneId, remoteId, addressId, drift, ts, ts);
}

export function updateLinkDrift(db: Db, zoneId: string, remoteId: string, drift: DriftState): void {
  db.prepare("UPDATE record_host_links SET drift = ?, checked_at = ? WHERE zone_id = ? AND remote_record_id = ?").run(
    drift,
    nowIso(),
    zoneId,
    remoteId,
  );
}

export function clearLinkRow(db: Db, zoneId: string, remoteId: string): void {
  db.prepare("DELETE FROM record_host_links WHERE zone_id = ? AND remote_record_id = ?").run(zoneId, remoteId);
}

export function listLinksByAddress(db: Db, addressId: string): LinkRow[] {
  return db.prepare("SELECT * FROM record_host_links WHERE host_address_id = ?").all(addressId) as unknown as LinkRow[];
}

export function listLinksByZone(db: Db, zoneId: string): LinkRow[] {
  return db.prepare("SELECT * FROM record_host_links WHERE zone_id = ?").all(zoneId) as unknown as LinkRow[];
}

export function hostUsageRows(db: Db, hostId: string): HostUsageRow[] {
  const rows = db
    .prepare(
      `SELECT r.zone_id, r.remote_record_id, r.name, r.type, r.value, r.status, r.line, l.drift, r.synced_at,
              z.name AS zone_name, z.account_id, z.provider, a.name AS account_name
       FROM record_host_links l
       JOIN host_addresses ad ON ad.id = l.host_address_id
       JOIN records r ON r.zone_id = l.zone_id AND r.remote_record_id = l.remote_record_id
       JOIN zones z ON z.id = r.zone_id
       JOIN accounts a ON a.id = z.account_id
       WHERE ad.host_id = ?
       ORDER BY z.name, r.name`,
    )
    .all(hostId) as unknown as Array<{
    zone_id: string;
    remote_record_id: string;
    name: string;
    type: string;
    value: string;
    status: string;
    line: string | null;
    drift: DriftState;
    synced_at: string;
    zone_name: string;
    account_id: string;
    provider: ProviderKind;
    account_name: string;
  }>;
  return rows.map((row) => ({
    zoneId: row.zone_id,
    zoneName: row.zone_name,
    accountId: row.account_id,
    accountName: row.account_name,
    provider: row.provider,
    recordId: row.remote_record_id,
    name: row.name,
    fqdn: fqdnOf(row.zone_name, row.name),
    type: row.type,
    value: row.value,
    line: row.line ?? "",
    status: row.status as RecordStatus,
    drift: row.drift,
    syncedAt: row.synced_at,
  }));
}

// ── audit ───────────────────────────────────────────────
export function insertAuditRow(
  db: Db,
  data: {
    accountId?: string | null;
    zoneId?: string | null;
    zoneName: string;
    action: string;
    beforeJson?: unknown;
    afterJson?: unknown;
    result: "SUCCESS" | "FAILED" | "PARTIAL";
    errorCode?: string;
    errorMessage?: string;
    requestId?: string;
  },
): void {
  db.prepare(
    `INSERT INTO audit_logs (id, account_id, zone_id, zone_name, action, before_json, after_json, result, error_code, error_message, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId("aud"),
    data.accountId ?? null,
    data.zoneId ?? null,
    data.zoneName,
    data.action,
    data.beforeJson === undefined ? null : JSON.stringify(data.beforeJson),
    data.afterJson === undefined ? null : JSON.stringify(data.afterJson),
    data.result,
    data.errorCode ?? null,
    data.errorMessage ?? null,
    data.requestId ?? null,
    nowIso(),
  );
}

export function listAuditRows(db: Db, filters: { zoneId?: string; accountId?: string; limit: number; offset: number }): AuditRow[] {
  const where: string[] = [];
  const values: unknown[] = [];
  if (filters.zoneId) {
    where.push("zone_id = ?");
    values.push(filters.zoneId);
  }
  if (filters.accountId) {
    where.push("account_id = ?");
    values.push(filters.accountId);
  }
  const sql = `SELECT * FROM audit_logs ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  values.push(filters.limit, filters.offset);
  return db.prepare(sql).all(...(values as never[])) as unknown as AuditRow[];
}

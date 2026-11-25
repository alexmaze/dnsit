import { fqdnOf, isAddressType, sameIp } from "@dnsit/shared";
import type { AppContext } from "../context.js";
import { HttpError } from "../errors.js";
import { getAddressRow, getRecordRow, insertAuditRow, setLinkRow } from "../repo.js";

export interface MatchSuggestion {
  zoneId: string;
  zoneName: string;
  remoteId: string;
  name: string;
  fqdn: string;
  type: string;
  value: string;
  addressId: string;
  hostId: string;
  hostName: string;
  hostStatus: string;
}

export interface AmbiguousCandidate {
  zoneId: string;
  zoneName: string;
  remoteId: string;
  fqdn: string;
  value: string;
  hosts: string[];
}

export interface MatchSuggestions {
  matches: MatchSuggestion[];
  ambiguous: AmbiguousCandidate[];
  alreadyBound: number;
  unmatched: number;
  hostsWithoutRecords: string[];
}

interface CandidateRow {
  zone_id: string;
  remote_record_id: string;
  name: string;
  type: string;
  value: string;
  zone_name: string;
  address_id: string;
  host_id: string;
  host_name: string;
  host_status: string;
}

/**
 * 按 IP 精确匹配「尚未绑定」的 A/AAAA 记录。
 * 不做自动绑定：同一个 IP 可能挂在多台主机上（CDN、迁移过渡），交给用户确认。
 */
export function hostMatchSuggestions(ctx: AppContext): MatchSuggestions {
  const rows = ctx.db
    .prepare(
      `SELECT r.zone_id, r.remote_record_id, r.name, r.type, r.value, z.name AS zone_name,
              a.id AS address_id, h.id AS host_id, h.name AS host_name, h.status AS host_status
       FROM records r
       JOIN zones z ON z.id = r.zone_id
       JOIN host_addresses a ON a.ip = r.value
       JOIN hosts h ON h.id = a.host_id
       WHERE r.type IN ('A', 'AAAA')
         AND NOT EXISTS (
           SELECT 1 FROM record_host_links l
           WHERE l.zone_id = r.zone_id AND l.remote_record_id = r.remote_record_id
         )
       ORDER BY h.name, z.name, r.name`,
    )
    .all() as unknown as CandidateRow[];

  const grouped = new Map<string, CandidateRow[]>();
  for (const row of rows) {
    const key = `${row.zone_id}:${row.remote_record_id}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const matches: MatchSuggestion[] = [];
  const ambiguous: AmbiguousCandidate[] = [];
  for (const list of grouped.values()) {
    const first = list[0]!;
    if (list.length > 1) {
      ambiguous.push({
        zoneId: first.zone_id,
        zoneName: first.zone_name,
        remoteId: first.remote_record_id,
        fqdn: fqdnOf(first.zone_name, first.name),
        value: first.value,
        hosts: [...new Set(list.map((row) => row.host_name))],
      });
      continue;
    }
    matches.push({
      zoneId: first.zone_id,
      zoneName: first.zone_name,
      remoteId: first.remote_record_id,
      name: first.name,
      fqdn: fqdnOf(first.zone_name, first.name),
      type: first.type,
      value: first.value,
      addressId: first.address_id,
      hostId: first.host_id,
      hostName: first.host_name,
      hostStatus: first.host_status,
    });
  }

  const alreadyBound = ctx.db.prepare("SELECT COUNT(*) AS n FROM record_host_links").get() as { n: number };
  const unboundAddressRecords = ctx.db
    .prepare(
      `SELECT COUNT(*) AS n FROM records r
       WHERE r.type IN ('A', 'AAAA')
         AND NOT EXISTS (SELECT 1 FROM record_host_links l WHERE l.zone_id = r.zone_id AND l.remote_record_id = r.remote_record_id)
         AND NOT EXISTS (SELECT 1 FROM host_addresses a WHERE a.ip = r.value)`,
    )
    .get() as { n: number };

  // 只统计「已绑定」的主机；候选里的主机还没绑定，不能算已使用
  const boundHostRows = ctx.db
    .prepare(
      `SELECT DISTINCT ad.host_id FROM record_host_links l
       JOIN host_addresses ad ON ad.id = l.host_address_id`,
    )
    .all() as unknown as Array<{ host_id: string }>;
  const usedHostIds = new Set(boundHostRows.map((row) => row.host_id));
  const hosts = ctx.db.prepare("SELECT id, name FROM hosts ORDER BY name").all() as unknown as Array<{
    id: string;
    name: string;
  }>;

  return {
    matches,
    ambiguous,
    alreadyBound: alreadyBound?.n ?? 0,
    unmatched: unboundAddressRecords?.n ?? 0,
    hostsWithoutRecords: hosts.filter((host) => !usedHostIds.has(host.id)).map((host) => host.name),
  };
}

export interface BindItem {
  zoneId: string;
  remoteId: string;
  addressId: string;
}

export interface BindResult {
  bound: Array<{ fqdn: string; hostName: string; ip: string }>;
  skipped: Array<{ zoneId: string; remoteId: string; reason: string }>;
}

export function bindHostMatches(ctx: AppContext, items: BindItem[]): BindResult {
  if (items.length === 0) throw new HttpError(422, "EMPTY_SELECTION", "没有选中任何记录");
  const bound: BindResult["bound"] = [];
  const skipped: BindResult["skipped"] = [];

  for (const item of items) {
    const record = getRecordRow(ctx.db, item.zoneId, item.remoteId);
    if (!record) {
      skipped.push({ zoneId: item.zoneId, remoteId: item.remoteId, reason: "记录已不存在" });
      continue;
    }
    if (!isAddressType(record.type)) {
      skipped.push({ zoneId: item.zoneId, remoteId: item.remoteId, reason: "不是 A/AAAA 记录" });
      continue;
    }
    const address = getAddressRow(ctx.db, item.addressId);
    if (!address) {
      skipped.push({ zoneId: item.zoneId, remoteId: item.remoteId, reason: "主机地址已不存在" });
      continue;
    }
    if (!sameIp(record.value, address.ip)) {
      skipped.push({ zoneId: item.zoneId, remoteId: item.remoteId, reason: `记录值 ${record.value} 与 ${address.ip} 不一致` });
      continue;
    }

    setLinkRow(ctx.db, item.zoneId, item.remoteId, item.addressId, "NONE");
    const host = ctx.db.prepare("SELECT name FROM hosts WHERE id = ?").get(address.host_id) as { name: string } | undefined;
    const zone = ctx.db.prepare("SELECT name FROM zones WHERE id = ?").get(item.zoneId) as { name: string } | undefined;
    const fqdn = fqdnOf(zone?.name ?? "", record.name);
    bound.push({ fqdn, hostName: host?.name ?? "", ip: address.ip });
    insertAuditRow(ctx.db, {
      zoneId: item.zoneId,
      zoneName: zone?.name ?? "",
      action: "HOST_LINK",
      afterJson: { fqdn, hostName: host?.name, ip: address.ip },
      result: "SUCCESS",
    });
  }

  return { bound, skipped };
}

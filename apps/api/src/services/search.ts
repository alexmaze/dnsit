import { normalizeIp } from "@dnsit/shared";
import type { AppContext } from "../context.js";
import { fqdnOf, normalizeFqdn } from "@dnsit/shared";

export interface SearchResult {
  zones: Array<{ id: string; name: string; accountName: string; provider: string }>;
  records: Array<{ zoneId: string; zoneName: string; remoteId: string; fqdn: string; type: string; value: string }>;
  hosts: Array<{ id: string; name: string; ips: string[] }>;
}

export function searchAll(ctx: AppContext, rawQuery: string): SearchResult {
  const query = rawQuery.trim().toLowerCase();
  const like = `%${query}%`;

  const zones = ctx.db
    .prepare(
      `SELECT z.id, z.name, a.name AS account_name, z.provider FROM zones z
       JOIN accounts a ON a.id = z.account_id WHERE lower(z.name) LIKE ? ORDER BY z.name LIMIT 20`,
    )
    .all(like) as unknown as Array<{ id: string; name: string; account_name: string; provider: string }>;

  const records = ctx.db
    .prepare(
      `SELECT r.zone_id, r.remote_record_id, r.name, r.type, r.value, z.name AS zone_name FROM records r
       JOIN zones z ON z.id = r.zone_id
       WHERE lower(r.name) LIKE ? OR lower(r.value) LIKE ? OR lower(r.name || '.' || z.name) LIKE ?
       ORDER BY r.name LIMIT 40`,
    )
    .all(like, like, like) as unknown as Array<{
    zone_id: string;
    remote_record_id: string;
    name: string;
    type: string;
    value: string;
    zone_name: string;
  }>;

  const parsedIp = normalizeIp(query);
  const hosts = (
    ctx.db
      .prepare(
        `SELECT DISTINCT h.id, h.name FROM hosts h LEFT JOIN host_addresses a ON a.host_id = h.id
         WHERE lower(h.name) LIKE ? OR a.ip LIKE ? ORDER BY h.name LIMIT 20`,
      )
      .all(like, parsedIp.ok ? `%${parsedIp.ip}%` : like) as unknown as Array<{ id: string; name: string }>
  ).map((host) => ({
    id: host.id,
    name: host.name,
    ips: (ctx.db.prepare("SELECT ip FROM host_addresses WHERE host_id = ? ORDER BY is_primary DESC").all(host.id) as unknown as Array<{ ip: string }>).map(
      (row) => row.ip,
    ),
  }));

  return {
    zones: zones.map((row) => ({ id: row.id, name: row.name, accountName: row.account_name, provider: row.provider })),
    records: records.map((row) => ({
      zoneId: row.zone_id,
      zoneName: row.zone_name,
      remoteId: row.remote_record_id,
      fqdn: fqdnOf(row.zone_name, row.name),
      type: row.type,
      value: row.value,
    })),
    hosts,
  };
}

export function highlightZoneName(name: string): string {
  return normalizeFqdn(name);
}

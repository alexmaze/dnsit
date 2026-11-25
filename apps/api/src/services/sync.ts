import type { ZoneSummary } from "@dnsit/shared";
import type { AppContext } from "../context.js";
import { HttpError } from "../errors.js";
import {
  getAccountRow,
  getZoneRow,
  listAccountRows,
  listZoneRows,
  markZoneSynced,
  replaceZoneRecords,
  toZoneSummary,
  updateAccountRow,
  upsertZone,
} from "../repo.js";
import type { ZoneRow } from "../repo.js";
import { providerForAccount } from "./accounts.js";
import { recomputeZoneDrift } from "./links.js";

export function zoneRecordsAreStale(zone: ZoneRow, ttlSeconds: number): boolean {
  if (!zone.last_synced_at) return true;
  return Date.now() - Date.parse(zone.last_synced_at) > ttlSeconds * 1000;
}

export function zonesListAreStale(rows: ZoneRow[], accountCount: number, ttlSeconds: number): boolean {
  if (rows.length === 0 || accountCount === 0) return true;
  return rows.some((row) => !row.last_synced_at || Date.now() - Date.parse(row.last_synced_at) > ttlSeconds * 1000 * 12);
}

export async function syncZones(ctx: AppContext, accountIds?: string[]): Promise<{ accounts: number; zones: number }> {
  const accounts = listAccountRows(ctx.db).filter((row) => !accountIds || accountIds.includes(row.id));
  let zoneCount = 0;
  for (const account of accounts) {
    const provider = providerForAccount(ctx, account);
    try {
      const zones = await provider.listZones();
      for (const zone of zones) {
        upsertZone(ctx.db, account.id, account.provider, zone);
        zoneCount += 1;
      }
      updateAccountRow(ctx.db, account.id, {
        status: "ok",
        last_verified_at: new Date().toISOString(),
        last_error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateAccountRow(ctx.db, account.id, { status: "invalid", last_error: message });
      throw error;
    }
  }
  return { accounts: accounts.length, zones: zoneCount };
}

export async function ensureZoneRecords(ctx: AppContext, zone: ZoneRow, refresh: boolean): Promise<ZoneRow> {
  if (!refresh && !zoneRecordsAreStale(zone, ctx.config.recordCacheTtl)) return zone;
  const account = getAccountRow(ctx.db, zone.account_id);
  if (!account) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "域名所属账号不存在");
  const provider = providerForAccount(ctx, account);
  const records = await provider.listRecords({
    name: zone.name,
    remoteZoneId: zone.remote_zone_id ?? undefined,
  });
  replaceZoneRecords(ctx.db, zone.id, zone.provider, records);
  markZoneSynced(ctx.db, zone.id, records.length);
  recomputeZoneDrift(ctx.db, zone.id);
  return getZoneRow(ctx.db, zone.id)!;
}

export function zoneSummaries(ctx: AppContext, accountId?: string): ZoneSummary[] {
  return listZoneRows(ctx.db, accountId).map(toZoneSummary);
}

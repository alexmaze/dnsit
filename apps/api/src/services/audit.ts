import type { AppContext } from "../context.js";
import { listAuditRows } from "../repo.js";

export interface AuditEntry {
  id: string;
  accountId?: string;
  zoneId?: string;
  zoneName: string;
  action: string;
  before?: unknown;
  after?: unknown;
  result: string;
  errorCode?: string;
  errorMessage?: string;
  requestId?: string;
  createdAt: string;
}

function parseJson(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function listAudit(
  ctx: AppContext,
  filters: { zoneId?: string; accountId?: string; page: number; pageSize: number },
): { items: AuditEntry[]; total: number } {
  const rows = listAuditRows(ctx.db, {
    zoneId: filters.zoneId,
    accountId: filters.accountId,
    limit: filters.pageSize,
    offset: (filters.page - 1) * filters.pageSize,
  });
  const countRow = ctx.db
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_logs
       ${filters.zoneId ? "WHERE zone_id = ?" : filters.accountId ? "WHERE account_id = ?" : ""}`,
    )
    .get(...(filters.zoneId ? [filters.zoneId] : filters.accountId ? [filters.accountId] : [])) as { n: number };

  return {
    items: rows.map((row) => ({
      id: row.id,
      accountId: row.account_id ?? undefined,
      zoneId: row.zone_id ?? undefined,
      zoneName: row.zone_name,
      action: row.action,
      before: parseJson(row.before_json),
      after: parseJson(row.after_json),
      result: row.result,
      errorCode: row.error_code ?? undefined,
      errorMessage: row.error_message ?? undefined,
      requestId: row.request_id ?? undefined,
      createdAt: row.created_at,
    })),
    total: countRow?.n ?? 0,
  };
}

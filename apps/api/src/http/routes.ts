import {
  accountCreateSchema,
  accountPatchSchema,
  createRecordSchema,
  hostImportSchema,
  hostInputSchema,
  hostPatchSchema,
  hostRolloutApplySchema,
  hostRolloutPlanSchema,
  recordStatusSchema,
  updateRecordSchema,
} from "@dnsit/shared";
import { Hono } from "hono";
import type { ZodType } from "zod";
import type { AppContext } from "../context.js";
import { HttpError } from "../errors.js";
import { createAccount, listAccounts, patchAccount, removeAccount, verifyAccount } from "../services/accounts.js";
import { listAudit } from "../services/audit.js";
import {
  addHostAddress,
  confirmHostImport,
  createHost,
  getHost,
  hostUsage,
  listHosts,
  lookupHostByIp,
  patchHost,
  patchHostAddress,
  previewHostImport,
  removeHost,
  removeHostAddress,
} from "../services/hosts.js";
import {
  createRecord,
  deleteRecord,
  loadZoneRecords,
  recordDependents,
  toggleRecordStatus,
  updateRecord,
  zoneLines,
  zoneRecordTypes,
} from "../services/records.js";
import { applyAddressChange, planAddressChange } from "../services/rollout.js";
import { searchAll } from "../services/search.js";
import { syncZones, zoneSummaries } from "../services/sync.js";

function parseBody<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issues = result.error.issues as Array<{ path: PropertyKey[]; message: string }>;
  const message = issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ");
  throw new HttpError(422, "VALIDATION_ERROR", message, { extra: issues });
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", "请求体不是合法 JSON");
  }
}

function qs(c: { req: { query: (key: string) => string | undefined } }, key: string): string | undefined {
  const value = c.req.query(key);
  return value && value.length > 0 ? value : undefined;
}

function flag(c: { req: { query: (key: string) => string | undefined } }, key: string): boolean {
  const value = c.req.query(key);
  return value === "1" || value === "true";
}

export function apiRoutes(ctx: AppContext): Hono {
  const api = new Hono();

  api.get("/health", (c) =>
    c.json({ data: { ok: true, database: ctx.config.dbFile, time: new Date().toISOString() } }),
  );

  // accounts
  api.get("/accounts", (c) => c.json({ data: listAccounts(ctx) }));
  api.post("/accounts", async (c) => {
    const payload = parseBody(accountCreateSchema, await readJson(c));
    const account = await createAccount(ctx, payload);
    return c.json({ data: account }, 201);
  });
  api.patch("/accounts/:id", async (c) => {
    const payload = parseBody(accountPatchSchema, await readJson(c));
    return c.json({ data: await patchAccount(ctx, c.req.param("id"), payload) });
  });
  api.delete("/accounts/:id", (c) => {
    const result = removeAccount(ctx, c.req.param("id"));
    return c.json({ data: { deleted: true, ...result } });
  });
  api.post("/accounts/:id/verify", async (c) => c.json({ data: await verifyAccount(ctx, c.req.param("id")) }));

  // zones
  api.get("/zones", async (c) => {
    if (flag(c, "refresh")) await syncZones(ctx);
    return c.json({ data: zoneSummaries(ctx, qs(c, "accountId")) });
  });
  api.post("/zones/sync", async (c) => c.json({ data: await syncZones(ctx) }));

  api.get("/zones/:id/records", async (c) => {
    const payload = await loadZoneRecords(ctx, c.req.param("id"), flag(c, "refresh"));
    return c.json({ data: payload });
  });
  api.post("/zones/:id/records", async (c) => {
    const payload = parseBody(createRecordSchema, await readJson(c));
    const record = await createRecord(ctx, c.req.param("id"), payload);
    return c.json({ data: record }, 201);
  });
  api.patch("/zones/:id/records/:rid", async (c) => {
    const payload = parseBody(updateRecordSchema, await readJson(c));
    const record = await updateRecord(ctx, c.req.param("id"), c.req.param("rid"), payload);
    return c.json({ data: record });
  });
  api.delete("/zones/:id/records/:rid", async (c) => {
    const result = await deleteRecord(ctx, c.req.param("id"), c.req.param("rid"), flag(c, "force"));
    return c.json({ data: result });
  });
  api.post("/zones/:id/records/:rid/status", async (c) => {
    const payload = parseBody(recordStatusSchema, await readJson(c));
    const record = await toggleRecordStatus(ctx, c.req.param("id"), c.req.param("rid"), payload.status);
    return c.json({ data: record });
  });
  api.get("/zones/:id/records/:rid/dependents", (c) =>
    c.json({ data: recordDependents(ctx, c.req.param("id"), c.req.param("rid")) }),
  );
  api.get("/zones/:id/lines", async (c) => c.json({ data: await zoneLines(ctx, c.req.param("id")) }));
  api.get("/zones/:id/record-types", async (c) => c.json({ data: await zoneRecordTypes(ctx, c.req.param("id")) }));

  // hosts
  api.get("/hosts", (c) =>
    c.json({ data: listHosts(ctx, { q: qs(c, "q"), tag: qs(c, "tag"), status: qs(c, "status") }) }),
  );
  api.post("/hosts", async (c) => {
    const payload = parseBody(hostInputSchema, await readJson(c));
    return c.json({ data: createHost(ctx, payload) }, 201);
  });
  api.get("/hosts/lookup", (c) => {
    const ip = qs(c, "ip");
    if (!ip) throw new HttpError(422, "VALIDATION_ERROR", "缺少 ip 参数");
    return c.json({ data: lookupHostByIp(ctx, ip) });
  });
  api.post("/hosts/import", async (c) => {
    const payload = parseBody(hostImportSchema, await readJson(c));
    return c.json({ data: previewHostImport(ctx, payload.text) });
  });
  api.post("/hosts/import/confirm", async (c) => {
    const payload = parseBody(hostImportSchema, await readJson(c));
    return c.json({ data: confirmHostImport(ctx, payload.text) });
  });
  api.get("/hosts/:id", (c) => c.json({ data: getHost(ctx, c.req.param("id")) }));
  api.patch("/hosts/:id", async (c) => {
    const payload = parseBody(hostPatchSchema, await readJson(c));
    return c.json({ data: patchHost(ctx, c.req.param("id"), payload) });
  });
  api.delete("/hosts/:id", (c) => {
    removeHost(ctx, c.req.param("id"), flag(c, "force"));
    return c.json({ data: { deleted: true } });
  });
  api.get("/hosts/:id/records", (c) => c.json({ data: hostUsage(ctx, c.req.param("id")) }));
  api.post("/hosts/:id/addresses", async (c) => {
    const payload = parseBody(hostInputSchema.shape.addresses.element, await readJson(c));
    return c.json({ data: addHostAddress(ctx, c.req.param("id"), payload) }, 201);
  });
  api.patch("/hosts/:id/addresses/:aid", async (c) => {
    const payload = parseBody(hostInputSchema.shape.addresses.element.partial(), await readJson(c));
    return c.json({ data: patchHostAddress(ctx, c.req.param("id"), c.req.param("aid"), payload) });
  });
  api.delete("/hosts/:id/addresses/:aid", (c) =>
    c.json({ data: removeHostAddress(ctx, c.req.param("id"), c.req.param("aid")) }),
  );
  api.post("/hosts/:id/addresses/:aid/plan", async (c) => {
    const payload = parseBody(hostRolloutPlanSchema, await readJson(c));
    return c.json({ data: planAddressChange(ctx, c.req.param("id"), c.req.param("aid"), payload.newIp) });
  });
  api.post("/hosts/:id/addresses/:aid/apply", async (c) => {
    const payload = parseBody(hostRolloutApplySchema, await readJson(c));
    const result = await applyAddressChange(
      ctx,
      c.req.param("id"),
      c.req.param("aid"),
      payload.newIp,
      payload.expectedCount,
    );
    return c.json({ data: result });
  });

  // search + audit
  api.get("/search", (c) => {
    const q = qs(c, "q");
    if (!q) return c.json({ data: { zones: [], records: [], hosts: [] } });
    return c.json({ data: searchAll(ctx, q) });
  });
  api.get("/audit", (c) => {
    const page = Number(qs(c, "page") ?? 1);
    const pageSize = Math.min(200, Math.max(1, Number(qs(c, "pageSize") ?? 50)));
    return c.json({
      data: listAudit(ctx, {
        zoneId: qs(c, "zoneId"),
        accountId: qs(c, "accountId"),
        page: Number.isFinite(page) && page > 0 ? page : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : 50,
      }),
    });
  });

  return api;
}

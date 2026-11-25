import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppContext } from "../context.js";
import { SecretBox } from "../crypto.js";
import { openDatabase } from "../db.js";
import { loadConfig } from "../env.js";
import {
  getHostRow,
  hostUsageRows,
  insertAccount,
  insertAddressRow,
  insertAuditRow,
  insertHostRow,
  upsertRecordRow,
  setLinkRow,
  upsertZone,
} from "../repo.js";
import { removeAccount } from "../services/accounts.js";

function makeContext(): AppContext {
  return {
    db: openDatabase(":memory:"),
    config: { ...loadConfig(), dbFile: ":memory:" },
    box: new SecretBox(crypto.randomBytes(32)),
  };
}

describe("removeAccount", () => {
  let ctx: AppContext;

  beforeEach(() => {
    ctx = makeContext();
  });

  it("cascades zones and records but leaves no dangling host links", () => {
    const accountId = "acc_test";
    insertAccount(ctx.db, {
      id: accountId,
      provider: "aliyun",
      name: "阿里-测试",
      accessKeyId: "LTAI_test",
      sealed: { cipher: "x", iv: "y", tag: "z", keyVersion: 1 },
      readonly: false,
    });
    const zone = upsertZone(ctx.db, accountId, "aliyun", { name: "example.com", recordCount: 1 });
    upsertRecordRow(ctx.db, zone.id, "aliyun", {
      remoteId: "r1",
      name: "api",
      type: "A",
      value: "1.2.3.4",
      ttl: 600,
      status: "ENABLE",
    });
    const host = insertHostRow(ctx.db, { name: "web-01", tags: [], status: "ACTIVE" });
    const address = insertAddressRow(ctx.db, {
      hostId: host.id,
      ip: "1.2.3.4",
      version: 4,
      scope: "PUBLIC",
      isPrimary: true,
    });
    setLinkRow(ctx.db, zone.id, "r1", address.id, "NONE");
    insertAuditRow(ctx.db, {
      accountId,
      zoneId: zone.id,
      zoneName: "example.com",
      action: "RECORD_CREATE",
      result: "SUCCESS",
    });

    expect(hostUsageRows(ctx.db, host.id)).toHaveLength(1);

    const result = removeAccount(ctx, accountId);
    expect(result).toEqual({ zones: 1, records: 1 });

    expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM zones").get()).toEqual({ n: 0 });
    expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM records").get()).toEqual({ n: 0 });
    expect(ctx.db.prepare("SELECT COUNT(*) AS n FROM record_host_links").get()).toEqual({ n: 0 });

    const audit = ctx.db.prepare("SELECT account_id FROM audit_logs").get() as { account_id: string | null };
    expect(audit.account_id).toBeNull();
    expect(getHostRow(ctx.db, host.id)).toBeTruthy();
  });

  it("rejects deleting an unknown account", () => {
    expect(() => removeAccount(ctx, "nope")).toThrowError(/账号不存在/);
  });
});

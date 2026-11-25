import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppContext } from "../context.js";
import { SecretBox } from "../crypto.js";
import { openDatabase } from "../db.js";
import { loadConfig } from "../env.js";
import {
  insertAccount,
  insertAddressRow,
  insertHostRow,
  upsertRecordRow,
  upsertZone,
} from "../repo.js";
import { bindHostMatches, hostMatchSuggestions } from "../services/hostMatching.js";

function makeContext(): AppContext {
  return {
    db: openDatabase(":memory:"),
    config: { ...loadConfig(), dbFile: ":memory:" },
    box: new SecretBox(crypto.randomBytes(32)),
  };
}

describe("host matching", () => {
  let ctx: AppContext;
  let zoneId: string;
  let webAddressId: string;
  let sharedA: string;
  let sharedB: string;

  beforeEach(() => {
    ctx = makeContext();
    insertAccount(ctx.db, {
      id: "acc_m",
      provider: "aliyun",
      name: "m",
      accessKeyId: "LTAI_m",
      sealed: { cipher: "c", iv: "i", tag: "t", keyVersion: 1 },
      readonly: false,
    });
    const zone = upsertZone(ctx.db, "acc_m", "aliyun", { name: "example.com" });
    zoneId = zone.id;

    const web = insertHostRow(ctx.db, { name: "web-01", tags: [], status: "ACTIVE" });
    webAddressId = insertAddressRow(ctx.db, { hostId: web.id, ip: "1.2.3.4", version: 4, scope: "PUBLIC", isPrimary: true }).id;

    // 同一个 IP 挂在两台主机上 → 歧义
    const a = insertHostRow(ctx.db, { name: "dup-a", tags: [], status: "ACTIVE" });
    const b = insertHostRow(ctx.db, { name: "dup-b", tags: [], status: "ACTIVE" });
    sharedA = insertAddressRow(ctx.db, { hostId: a.id, ip: "9.9.9.9", version: 4, scope: "PUBLIC", isPrimary: true }).id;
    sharedB = insertAddressRow(ctx.db, { hostId: b.id, ip: "9.9.9.9", version: 4, scope: "PUBLIC", isPrimary: true }).id;

    const base = { ttl: 600, status: "ENABLE" as const, line: "default" };
    upsertRecordRow(ctx.db, zoneId, "aliyun", { remoteId: "r1", name: "www", type: "A", value: "1.2.3.4", ...base });
    upsertRecordRow(ctx.db, zoneId, "aliyun", { remoteId: "r2", name: "shared", type: "A", value: "9.9.9.9", ...base });
    upsertRecordRow(ctx.db, zoneId, "aliyun", { remoteId: "r3", name: "orphan", type: "A", value: "8.8.8.8", ...base });
    upsertRecordRow(ctx.db, zoneId, "aliyun", { remoteId: "r4", name: "alias", type: "CNAME", value: "1.2.3.4", ...base });
  });

  it("separates unambiguous matches from ip conflicts", () => {
    const result = hostMatchSuggestions(ctx);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ remoteId: "r1", hostName: "web-01", addressId: webAddressId });
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0]!.hosts.sort()).toEqual(["dup-a", "dup-b"]);
    expect(result.unmatched).toBe(1);
    expect(result.alreadyBound).toBe(0);
    // 还没绑定任何记录时，三台主机都算「未被引用」
    expect(result.hostsWithoutRecords.sort()).toEqual(["dup-a", "dup-b", "web-01"]);
  });

  it("binds a match and records an audit entry", () => {
    const result = bindHostMatches(ctx, [{ zoneId, remoteId: "r1", addressId: webAddressId }]);
    expect(result.bound).toHaveLength(1);
    expect(result.bound[0]).toMatchObject({ fqdn: "www.example.com", hostName: "web-01" });
    expect(result.skipped).toHaveLength(0);

    const link = ctx.db.prepare("SELECT drift FROM record_host_links WHERE remote_record_id = 'r1'").get() as {
      drift: string;
    };
    expect(link.drift).toBe("NONE");

    const audit = ctx.db.prepare("SELECT action FROM audit_logs").all() as Array<{ action: string }>;
    expect(audit.map((row) => row.action)).toContain("HOST_LINK");

    // 绑定后不再出现在建议里
    expect(hostMatchSuggestions(ctx).matches).toHaveLength(0);
    expect(hostMatchSuggestions(ctx).alreadyBound).toBe(1);
    // web-01 绑定后不再是「无记录的主机」
    expect(hostMatchSuggestions(ctx).hostsWithoutRecords.sort()).toEqual(["dup-a", "dup-b"]);
  });

  it("skips records whose value no longer matches the address", () => {
    const result = bindHostMatches(ctx, [{ zoneId, remoteId: "r3", addressId: webAddressId }]);
    expect(result.bound).toHaveLength(0);
    expect(result.skipped[0]!.reason).toContain("不一致");
  });

  it("refuses to bind a cname", () => {
    const result = bindHostMatches(ctx, [{ zoneId, remoteId: "r4", addressId: sharedA }]);
    expect(result.bound).toHaveLength(0);
    expect(result.skipped[0]!.reason).toContain("A/AAAA");
  });
});

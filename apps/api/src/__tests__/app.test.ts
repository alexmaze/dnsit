import crypto from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { AppContext } from "../context.js";
import { SecretBox } from "../crypto.js";
import { openDatabase } from "../db.js";
import { insertAccount } from "../repo.js";
import { loadConfig } from "../env.js";

function makeContext(): AppContext {
  const config = { ...loadConfig(), dbFile: ":memory:", masterKey: undefined };
  return {
    db: openDatabase(":memory:"),
    config,
    box: new SecretBox(crypto.randomBytes(32)),
  };
}

const WRITE = { "content-type": "application/json", "x-dnsit-client": "web" };
const READ = { "content-type": "application/json" };

describe("api app", () => {
  let app: ReturnType<typeof createApp>;
  let ctx: AppContext;

  beforeEach(() => {
    ctx = makeContext();
    app = createApp(ctx);
  });

  it("serves health", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: { ok: boolean } };
    expect(payload.data.ok).toBe(true);
  });

  it("blocks writes without the client header", async () => {
    const response = await app.request("/api/hosts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x", addresses: [{ ip: "1.1.1.1" }] }),
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("CSRF_BLOCKED");
  });

  it("creates and lists a host", async () => {
    const created = await app.request("/api/hosts", {
      method: "POST",
      headers: WRITE,
      body: JSON.stringify({
        name: "web-01",
        tags: ["prod"],
        status: "ACTIVE",
        addresses: [{ ip: "1.2.3.4" }, { ip: "10.0.0.5", scope: "PRIVATE" }],
      }),
    });
    expect(created.status).toBe(201);
    const list = await app.request("/api/hosts", { headers: READ });
    const payload = (await list.json()) as { data: Array<{ name: string; addresses: unknown[] }> };
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]!.name).toBe("web-01");
    expect(payload.data[0]!.addresses).toHaveLength(2);
  });

  it("rejects duplicate host name and invalid ip", async () => {
    await app.request("/api/hosts", {
      method: "POST",
      headers: WRITE,
      body: JSON.stringify({ name: "dup", addresses: [{ ip: "1.1.1.1" }] }),
    });
    const duplicate = await app.request("/api/hosts", {
      method: "POST",
      headers: WRITE,
      body: JSON.stringify({ name: "dup", addresses: [{ ip: "2.2.2.2" }] }),
    });
    expect(duplicate.status).toBe(409);

    const badIp = await app.request("/api/hosts", {
      method: "POST",
      headers: WRITE,
      body: JSON.stringify({ name: "bad", addresses: [{ ip: "example.com" }] }),
    });
    expect(badIp.status).toBe(422);
  });

  it("normalizes ipv6 when storing", async () => {
    await app.request("/api/hosts", {
      method: "POST",
      headers: WRITE,
      body: JSON.stringify({ name: "v6", addresses: [{ ip: "2001:0db8:0000:0000:0000:0000:0000:0001" }] }),
    });
    const list = await app.request("/api/hosts", { headers: READ });
    const payload = (await list.json()) as { data: Array<{ addresses: Array<{ ip: string }> }> };
    expect(payload.data[0]!.addresses[0]!.ip).toBe("2001:db8::1");
  });

  it("previews import and reports bad lines", async () => {
    const response = await app.request("/api/hosts/import", {
      method: "POST",
      headers: WRITE,
      body: JSON.stringify({ text: "a 1.1.1.1\nbroken\nb 2.2.2.2 2001:db8::2" }),
    });
    const payload = (await response.json()) as {
      data: Array<{ name: string; ok: boolean; ips: string[] }>;
    };
    expect(payload.data).toHaveLength(3);
    expect(payload.data[0]!.ok).toBe(true);
    expect(payload.data[1]!.ok).toBe(false);
    expect(payload.data[2]!.ips).toEqual(["2.2.2.2", "2001:db8::2"]);
  });

  it("renames an account without re-verifying, and deletes it", async () => {
    insertAccount(ctx.db, {
      id: "acc_x",
      provider: "tencent",
      name: "旧名字",
      accessKeyId: "AKIDxxxx",
      sealed: { cipher: "c", iv: "i", tag: "t", keyVersion: 1 },
      readonly: false,
    });

    const renamed = await app.request("/api/accounts/acc_x", {
      method: "PATCH",
      headers: WRITE,
      body: JSON.stringify({ name: "新名字" }),
    });
    expect(renamed.status).toBe(200);
    const renamedBody = (await renamed.json()) as { data: { name: string; accessKeyMasked: string } };
    expect(renamedBody.data.name).toBe("新名字");
    expect(renamedBody.data.accessKeyMasked).not.toContain("xxxx");

    const removed = await app.request("/api/accounts/acc_x", { method: "DELETE", headers: WRITE });
    expect(removed.status).toBe(200);
    const removedBody = (await removed.json()) as { data: { deleted: boolean; zones: number } };
    expect(removedBody.data).toMatchObject({ deleted: true, zones: 0 });

    const list = await app.request("/api/accounts", { headers: READ });
    expect(((await list.json()) as { data: unknown[] }).data).toHaveLength(0);
  });

  it("rejects renaming to an existing account name", async () => {
    for (const [id, name] of [["acc_a", "甲"], ["acc_b", "乙"]]) {
      insertAccount(ctx.db, {
        id,
        provider: "aliyun",
        name,
        accessKeyId: "LTAI0000",
        sealed: { cipher: "c", iv: "i", tag: "t", keyVersion: 1 },
        readonly: false,
      });
    }
    const response = await app.request("/api/accounts/acc_b", {
      method: "PATCH",
      headers: WRITE,
      body: JSON.stringify({ name: "甲" }),
    });
    expect(response.status).toBe(409);
  });

  it("returns 404 for unknown routes", async () => {
    const response = await app.request("/api/nope", { headers: READ });
    expect(response.status).toBe(404);
  });

  it("refuses to delete a host that is still referenced", async () => {
    const created = await app.request("/api/hosts", {
      method: "POST",
      headers: WRITE,
      body: JSON.stringify({ name: "used", addresses: [{ ip: "3.3.3.3" }] }),
    });
    const host = (await created.json()) as { data: { id: string; addresses: Array<{ id: string }> } };
    // 手动制造一条引用，模拟记录绑定
    ctx.db
      .prepare(
        "INSERT INTO record_host_links (id, zone_id, remote_record_id, host_address_id, drift, created_at, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("link1", "zone1", "rec1", host.data.addresses[0]!.id, "NONE", new Date().toISOString(), new Date().toISOString());

    const blocked = await app.request(`/api/hosts/${host.data.id}`, { method: "DELETE", headers: WRITE });
    expect(blocked.status).toBe(409);

    const forced = await app.request(`/api/hosts/${host.data.id}?force=1`, { method: "DELETE", headers: WRITE });
    expect(forced.status).toBe(200);
  });
});
import { describe, expect, it } from "vitest";
import { diffRecord } from "../diff.js";
import type { NormalizedRecord } from "../types.js";

const before: NormalizedRecord = {
  id: "r1",
  zoneId: "z1",
  remoteId: "r1",
  name: "www",
  fqdn: "www.example.com",
  type: "A",
  value: "1.2.3.4",
  ttl: 600,
  line: { code: "default", label: "默认" },
  status: "ENABLE",
};

describe("diffRecord", () => {
  it("reports only changed fields", () => {
    const changes = diffRecord(before, { name: "www", type: "A", value: "1.2.3.5", ttl: 600 });
    expect(changes.map((c) => c.field)).toEqual(["value"]);
  });

  it("returns nothing when identical", () => {
    expect(diffRecord(before, { name: "www", type: "A", value: "1.2.3.4", ttl: 600 })).toEqual([]);
  });

  it("normalizes cname values with trailing dot", () => {
    const cname = { ...before, type: "CNAME", value: "api.example.com" };
    expect(diffRecord(cname, { name: "www", type: "CNAME", value: "api.example.com.", ttl: 600 })).toEqual([]);
  });

  it("lists fields for a new record", () => {
    const changes = diffRecord(null, { name: "@", type: "A", value: "1.1.1.1", ttl: 600 });
    expect(changes.map((c) => c.field)).toContain("value");
  });
});

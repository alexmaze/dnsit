import { describe, expect, it } from "vitest";
import { buildZoneTree } from "../tree.js";
import type { NormalizedRecord } from "../types.js";

let seq = 0;
function rec(partial: Partial<NormalizedRecord> & Pick<NormalizedRecord, "name" | "type" | "value">): NormalizedRecord {
  seq += 1;
  const name = partial.name;
  return {
    id: `r${seq}`,
    zoneId: "z1",
    remoteId: `r${seq}`,
    name,
    fqdn: name === "@" ? "example.com" : `${name}.example.com`,
    type: partial.type,
    value: partial.value,
    ttl: 600,
    line: { code: "default", label: "默认" },
    status: "ENABLE",
    ...partial,
  };
}

describe("buildZoneTree", () => {
  it("mounts a cname under its target rr", () => {
    const tree = buildZoneTree({
      zoneName: "example.com",
      records: [
        rec({ name: "api", type: "A", value: "1.2.3.4" }),
        rec({ name: "www", type: "CNAME", value: "api.example.com." }),
      ],
    });
    const api = tree.nodes.get("api")!;
    expect(api.children).toHaveLength(1);
    expect(api.children[0]!.node.name).toBe("www");
    expect(tree.roots.map((n) => n.name)).toEqual(["api"]);
    expect(tree.stats.dangling).toBe(0);
  });

  it("flags a dangling target", () => {
    const tree = buildZoneTree({
      zoneName: "example.com",
      records: [rec({ name: "blog", type: "CNAME", value: "gone.example.com" })],
    });
    const gone = tree.nodes.get("gone")!;
    expect(gone.dangling).toBe(true);
    expect(gone.children[0]!.node.name).toBe("blog");
    expect(tree.stats.dangling).toBe(1);
  });

  it("marks external targets inside and outside the platform", () => {
    const tree = buildZoneTree({
      zoneName: "example.com",
      records: [
        rec({ name: "a", type: "CNAME", value: "www.other.com" }),
        rec({ name: "b", type: "CNAME", value: "www.outside.net" }),
      ],
      platformZones: [{ name: "other.com", zoneId: "z2" }],
    });
    const a = tree.nodes.get("a")!;
    expect(a.externals[0]).toEqual({ fqdn: "www.other.com", inPlatform: true, zoneId: "z2" });
    const b = tree.nodes.get("b")!;
    expect(b.externals[0]!.inPlatform).toBe(false);
  });

  it("detects cycles without hanging", () => {
    const tree = buildZoneTree({
      zoneName: "example.com",
      records: [
        rec({ name: "a", type: "CNAME", value: "b.example.com" }),
        rec({ name: "b", type: "CNAME", value: "a.example.com" }),
      ],
    });
    expect(tree.stats.cycles).toBeGreaterThan(0);
    expect(tree.roots.length).toBeGreaterThan(0);
  });

  it("handles multi-line cname pointing to different targets", () => {
    const tree = buildZoneTree({
      zoneName: "example.com",
      records: [
        rec({ name: "edge", type: "CNAME", value: "a.example.com", line: { code: "telecom", label: "电信" } }),
        rec({ name: "edge", type: "CNAME", value: "b.example.com" }),
        rec({ name: "a", type: "A", value: "1.1.1.1" }),
        rec({ name: "b", type: "A", value: "2.2.2.2" }),
      ],
    });
    const edge = tree.nodes.get("edge")!;
    expect(edge.parentCount).toBe(2);
    expect(edge.multiTarget).toBe(true);
    expect(edge.cycle).toBe(false);
  });

  it("marks disabled target nodes", () => {
    const tree = buildZoneTree({
      zoneName: "example.com",
      records: [
        rec({ name: "api", type: "A", value: "1.2.3.4", status: "DISABLE" }),
        rec({ name: "www", type: "CNAME", value: "api.example.com" }),
      ],
    });
    expect(tree.nodes.get("api")!.disabledTarget).toBe(true);
  });

  it("keeps apex as the first root", () => {
    const tree = buildZoneTree({
      zoneName: "example.com",
      records: [
        rec({ name: "@", type: "A", value: "1.1.1.1" }),
        rec({ name: "www", type: "A", value: "2.2.2.2" }),
      ],
    });
    expect(tree.roots[0]!.name).toBe("@");
  });
});

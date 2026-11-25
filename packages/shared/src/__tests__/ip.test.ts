import { describe, expect, it } from "vitest";
import { canonicalizeIpv6, normalizeIp, sameIp } from "../ip.js";

describe("normalizeIp", () => {
  it("accepts ipv4", () => {
    expect(normalizeIp("1.2.3.4")).toEqual({ ok: true, ip: "1.2.3.4", version: 4 });
  });

  it("compresses ipv6", () => {
    const result = normalizeIp("2001:0db8:0000:0000:0000:ff00:0042:8329");
    expect(result.ok && result.ip).toBe("2001:db8::ff00:42:8329");
    expect(canonicalizeIpv6("0:0:0:0:0:0:0:1")).toBe("::1");
    expect(canonicalizeIpv6("::1")).toBe("::1");
    expect(canonicalizeIpv6("fe80::1")).toBe("fe80::1");
  });

  it("rejects domain names with a helpful message", () => {
    const result = normalizeIp("api.example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("域名");
  });

  it("rejects garbage", () => {
    expect(normalizeIp("999.1.1.1").ok).toBe(false);
    expect(normalizeIp("").ok).toBe(false);
  });

  it("treats equivalent ipv6 as equal", () => {
    expect(sameIp("::1", "0:0:0:0:0:0:0:1")).toBe(true);
    expect(sameIp("1.1.1.1", "1.1.1.2")).toBe(false);
  });
});
describe("pure ipv6 validator", () => {
  it("rejects malformed ipv6", () => {
    expect(normalizeIp(":::").ok).toBe(false);
    expect(normalizeIp("1:2:3:4:5:6:7:8:9").ok).toBe(false);
    expect(normalizeIp("1:2:3:4:5:6:7").ok).toBe(false);
    expect(normalizeIp("gggg::1").ok).toBe(false);
  });

  it("accepts compressed and embedded forms", () => {
    expect(normalizeIp("::").ok).toBe(true);
    expect(normalizeIp("fe80::1").ok).toBe(true);
    expect(canonicalizeIpv6("::ffff:192.168.1.1")).toBe("::ffff:c0a8:101");
    expect(canonicalizeIpv6("2001:db8:0:0:1:0:0:1")).toBe("2001:db8::1:0:0:1");
  });

  it("rejects ipv4 with leading zeros", () => {
    expect(normalizeIp("01.2.3.4").ok).toBe(false);
  });
});

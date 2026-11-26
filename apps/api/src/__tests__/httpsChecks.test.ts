import { describe, expect, it, vi } from "vitest";
import { checkHttpsDomain, normalizeCheckTarget } from "../services/httpsChecks.js";

function fakeFetch(response: Response | (() => Promise<Response>)): typeof fetch {
  return vi.fn(typeof response === "function" ? response : async () => response) as unknown as typeof fetch;
}

describe("https checks", () => {
  it("normalizes hostnames and rejects unsafe or wildcard targets", () => {
    expect(normalizeCheckTarget(" WWW.Example.COM. ")).toEqual({ domain: "www.example.com" });
    expect(normalizeCheckTarget("*.example.com")).toEqual({ error: "通配符域名无法直接测试" });
    expect(normalizeCheckTarget("example.com/path").error).toBeTruthy();
    expect(normalizeCheckTarget("example.com:8443").error).toBeTruthy();
    expect(normalizeCheckTarget("http://example.com").error).toBeTruthy();
    expect(normalizeCheckTarget("127.0.0.1")).toEqual({ error: "IP 地址无法作为域名测试" });
    expect(normalizeCheckTarget("127.1")).toEqual({ error: "域名格式不合法，无法测试" });
    expect(normalizeCheckTarget("0x7f.0.0.1")).toEqual({ error: "域名格式不合法，无法测试" });
    expect(normalizeCheckTarget("localhost")).toEqual({ error: "本地域名无法测试" });
  });

  it("returns ok for 2xx responses without reading the body", async () => {
    const fetchImpl = fakeFetch(new Response(null, { status: 200 }));
    const result = await checkHttpsDomain("www.example.com", { fetchImpl });
    expect(result).toMatchObject({
      domain: "www.example.com",
      state: "OK",
      ok: true,
      httpStatus: 200,
      finalUrl: "https://www.example.com/",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.example.com/",
      expect.objectContaining({ method: "GET", redirect: "follow" }),
    );
  });

  it("reports http errors with the status code", async () => {
    const result = await checkHttpsDomain("www.example.com", {
      fetchImpl: fakeFetch(new Response(null, { status: 404 })),
    });
    expect(result.state).toBe("HTTP_ERROR");
    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(404);
    expect(result.error).toContain("404");
  });

  it("classifies dns and tls failures", async () => {
    const dns = await checkHttpsDomain("missing.example.com", {
      fetchImpl: fakeFetch(() => Promise.reject(new Error("fetch failed", { cause: { code: "ENOTFOUND" } }))),
    });
    expect(dns).toMatchObject({ state: "DNS_ERROR", ok: false, error: "域名解析失败" });

    const tls = await checkHttpsDomain("expired.example.com", {
      fetchImpl: fakeFetch(() =>
        Promise.reject(new Error("fetch failed", { cause: { code: "CERT_HAS_EXPIRED" } })),
      ),
    });
    expect(tls.state).toBe("TLS_ERROR");
    expect(tls.ok).toBe(false);
  });

  it("times out slow responses", async () => {
    const hangingFetch = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      })) as unknown as typeof fetch;
    const result = await checkHttpsDomain("slow.example.com", {
      timeoutMs: 10,
      fetchImpl: hangingFetch,
    });
    expect(result).toMatchObject({ state: "TIMEOUT", ok: false });
    expect(result.error).toContain("10 ms");
  });

  it("marks wildcard domains as invalid without making a request", async () => {
    const fetchImpl = fakeFetch(new Response(null, { status: 200 }));
    const result = await checkHttpsDomain("*.example.com", { fetchImpl });
    expect(result).toMatchObject({ state: "INVALID", ok: false, domain: "*.example.com" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

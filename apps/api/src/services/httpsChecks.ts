import { isIP } from "node:net";
import type { HttpsCheckResult, HttpsCheckState } from "@dnsit/shared";

const DEFAULT_TIMEOUT_MS = 6_000;
const USER_AGENT = "dnsit-https-check/1.0";

export interface HttpsCheckOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface CheckedTarget {
  domain?: string;
  error?: string;
}

/**
 * 规范化待检测域名。
 *
 * 只接受 FQDN 形式的主机名，拒绝通配符、协议、端口、路径等，避免请求被构造成任意 URL。
 * 通配符记录（如 *.example.com）无法直接解析，返回不可测试原因。
 */
export function normalizeCheckTarget(raw: string): CheckedTarget {
  const domain = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!domain) return { error: "域名为空，无法测试" };
  if (domain.startsWith("*.")) return { error: "通配符域名无法直接测试" };
  if (domain === "localhost" || domain.endsWith(".localhost")) return { error: "本地域名无法测试" };
  if (isIP(domain) !== 0) return { error: "IP 地址无法作为域名测试" };
  if (domain.length > 253) return { error: "域名过长，无法测试" };
  if (
    !/^(?=.{1,253}$)(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(
      domain,
    )
  ) {
    return { error: "域名格式不合法，无法测试" };
  }

  // 用 URL 解析做二次校验，避免 127.1、0x7f.0.0.1 这类写法被规范化为内网地址。
  let parsed: URL;
  try {
    parsed = new URL(`https://${domain}/`);
  } catch {
    return { error: "域名格式不合法，无法测试" };
  }
  if (
    parsed.hostname !== domain ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    return { error: "域名格式不合法，无法测试" };
  }
  if (isIP(parsed.hostname) !== 0) return { error: "IP 地址无法作为域名测试" };

  return { domain };
}

function classifyNetworkError(error: unknown): { state: HttpsCheckState; message: string } {
  const err = error as {
    name?: string;
    message?: string;
    cause?: {
      code?: string;
      message?: string;
      errors?: Array<{ code?: string; message?: string }>;
    };
  };
  const nested = err.cause?.errors ?? [];
  const code = [err.cause?.code, ...nested.map((item) => item.code)]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  const detail = [err.cause?.message, ...nested.map((item) => item.message), err.message]
    .filter(Boolean)
    .join("；");

  if (/ENOTFOUND|EAI_AGAIN|ENODATA|ESERVFAIL|getaddrinfo/i.test(`${code} ${detail}`)) {
    return { state: "DNS_ERROR", message: "域名解析失败" };
  }
  if (/ETIMEDOUT|CONNECT_TIMEOUT|HEADERS_TIMEOUT|BODY_TIMEOUT|TIMEOUT/i.test(code)) {
    return { state: "TIMEOUT", message: "连接超时" };
  }
  if (/CERT|TLS|SSL|VERIFY/i.test(code) || /certificate|tls|ssl/i.test(detail)) {
    return { state: "TLS_ERROR", message: "HTTPS 证书或 TLS 握手失败" };
  }
  if (code === "ECONNREFUSED") {
    return { state: "NETWORK_ERROR", message: "连接被拒绝" };
  }
  if (code === "ECONNRESET") {
    return { state: "NETWORK_ERROR", message: "连接被重置" };
  }
  return { state: "NETWORK_ERROR", message: detail || "无法建立 HTTPS 连接" };
}

/**
 * 检测一个域名是否可以通过 HTTPS 访问。
 *
 * 使用 GET 并跟随重定向，拿到响应头后立即取消响应体；2xx/3xx 视为访问正常，
 * 4xx/5xx、DNS/证书/超时/连接错误均记录具体原因。
 */
export async function checkHttpsDomain(
  rawDomain: string,
  options: HttpsCheckOptions = {},
): Promise<HttpsCheckResult> {
  const target = normalizeCheckTarget(rawDomain);
  const checkedAt = new Date().toISOString();
  if (!target.domain) {
    return {
      domain: rawDomain.trim().toLowerCase().replace(/\.$/, ""),
      state: "INVALID",
      ok: false,
      error: target.error,
      elapsedMs: 0,
      checkedAt,
    };
  }

  const domain = target.domain;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`https://${domain}/`, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "*/*",
      },
    });
    const elapsedMs = Date.now() - started;
    void response.body?.cancel().catch(() => undefined);
    const finalUrl = response.url || `https://${domain}/`;

    if (response.status >= 200 && response.status < 400) {
      return {
        domain,
        state: "OK",
        ok: true,
        httpStatus: response.status,
        finalUrl,
        elapsedMs,
        checkedAt: new Date().toISOString(),
      };
    }

    return {
      domain,
      state: "HTTP_ERROR",
      ok: false,
      httpStatus: response.status,
      finalUrl,
      error: `HTTPS 返回 HTTP ${response.status}`,
      elapsedMs,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    const elapsedMs = Date.now() - started;
    if (controller.signal.aborted) {
      return {
        domain,
        state: "TIMEOUT",
        ok: false,
        error: `超过 ${timeoutMs} ms 未响应`,
        elapsedMs,
        checkedAt: new Date().toISOString(),
      };
    }
    const { state, message } = classifyNetworkError(error);
    return {
      domain,
      state,
      ok: false,
      error: message,
      elapsedMs,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

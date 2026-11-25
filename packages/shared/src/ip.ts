export type IpParseResult =
  | { ok: true; ip: string; version: 4 | 6 }
  | { ok: false; reason: string };

export function isValidIpv4(input: string): boolean {
  const parts = input.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    if (part.length > 1 && part.startsWith("0")) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

export function isValidIpv6(input: string): boolean {
  if (!input.includes(":")) return false;
  if (input.includes("%")) return false;
  let value = input;
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    if (lastColon === -1) return false;
    const embedded = value.slice(lastColon + 1);
    if (!isValidIpv4(embedded)) return false;
    value = `${value.slice(0, lastColon + 1)}0:0`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return false;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups = [...head, ...tail];
  if (groups.length === 0) return halves.length === 2;
  if (groups.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) return false;
  if (halves.length === 2) return groups.length <= 7;
  return groups.length === 8;
}

function expandIpv6(input: string): string[] {
  let value = input.toLowerCase();
  const embedded = value.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (embedded) {
    const octets = embedded[1]!.split(".").map((n) => Number(n));
    const hex =
      ((octets[0]! << 8) | octets[1]!).toString(16) + ":" + ((octets[2]! << 8) | octets[3]!).toString(16);
    value = value.slice(0, value.length - embedded[1]!.length) + hex;
  }
  const doubleColon = value.indexOf("::");
  const head = doubleColon === -1 ? value.split(":") : value.slice(0, doubleColon).split(":").filter(Boolean);
  const tail = doubleColon === -1 ? [] : value.slice(doubleColon + 2).split(":").filter(Boolean);
  const groups =
    doubleColon === -1 ? head : [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail];
  return groups.map((group) => group.replace(/^0+(?=.)/, "") || "0");
}

function compressIpv6(groups: string[]): string {
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < groups.length; ) {
    if (groups[i] !== "0") {
      i += 1;
      continue;
    }
    let j = i;
    while (j < groups.length && groups[j] === "0") j += 1;
    if (j - i > bestLen && j - i > 1) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  if (bestStart < 0) return groups.join(":");
  const head = groups.slice(0, bestStart).join(":");
  const tail = groups.slice(bestStart + bestLen).join(":");
  return `${head}::${tail}`;
}

export function canonicalizeIpv6(input: string): string {
  return compressIpv6(expandIpv6(input.trim()));
}

const DOMAIN_LIKE = /^[a-z0-9_-]+(\.[a-z0-9_-]+)*\.[a-z]{2,}$/i;

export function normalizeIp(raw: string): IpParseResult {
  const input = (raw ?? "").trim();
  if (!input) return { ok: false, reason: "IP 不能为空" };
  if (isValidIpv4(input)) return { ok: true, ip: input, version: 4 };
  if (isValidIpv6(input)) return { ok: true, ip: canonicalizeIpv6(input), version: 6 };
  if (DOMAIN_LIKE.test(input)) {
    return { ok: false, reason: "这是域名，不是 IP；A/AAAA 记录的值必须是 IP，域名请用 CNAME" };
  }
  return { ok: false, reason: "不是合法的 IPv4 / IPv6 地址" };
}

export function sameIp(a: string, b: string): boolean {
  const left = normalizeIp(a);
  const right = normalizeIp(b);
  if (!left.ok || !right.ok) return a.trim().toLowerCase() === b.trim().toLowerCase();
  return left.ip === right.ip;
}

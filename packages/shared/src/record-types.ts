export const RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SRV",
  "CAA",
  "REDIRECT_URL",
  "FORWORD_URL",
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

export const ADDRESS_TYPES: readonly string[] = ["A", "AAAA"];

export const TTL_PRESETS = [60, 120, 300, 600, 1800, 3600, 43200, 86400];

export function normalizeFqdn(value: string): string {
  return (value ?? "").trim().toLowerCase().replace(/\.+$/, "");
}

export function normalizeRecordName(name: string): string {
  const value = (name ?? "").trim().replace(/\.+$/, "");
  if (!value || value === "@") return "@";
  return value.toLowerCase();
}

export function isApexName(name: string): boolean {
  return normalizeRecordName(name) === "@";
}

export function fqdnOf(zoneName: string, name: string): string {
  const zone = normalizeFqdn(zoneName);
  const record = normalizeRecordName(name);
  return record === "@" ? zone : `${record}.${zone}`;
}

export function isAddressType(type: string): boolean {
  return ADDRESS_TYPES.includes(type.toUpperCase());
}

export function isWithinZone(fqdn: string, zoneName: string): boolean {
  const target = normalizeFqdn(fqdn);
  const zone = normalizeFqdn(zoneName);
  return target === zone || target.endsWith(`.${zone}`);
}

export function relativeName(fqdn: string, zoneName: string): string {
  const target = normalizeFqdn(fqdn);
  const zone = normalizeFqdn(zoneName);
  if (target === zone) return "@";
  return target.slice(0, -(zone.length + 1));
}

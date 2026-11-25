import { normalizeFqdn, normalizeRecordName } from "./record-types.js";
import type { NormalizedRecord, RecordInput } from "./types.js";

export interface FieldChange {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}

const LABELS: Record<string, string> = {
  name: "主机记录",
  type: "类型",
  value: "记录值",
  ttl: "TTL",
  line: "线路",
  priority: "MX 优先级",
  weight: "权重",
  status: "状态",
  remark: "备注",
  host: "绑定主机",
};

function canonicalValue(type: string, value: string): string {
  const trimmed = (value ?? "").trim();
  if (type.toUpperCase() === "CNAME") return normalizeFqdn(trimmed);
  if (type.toUpperCase() === "A" || type.toUpperCase() === "AAAA") return trimmed.toLowerCase();
  return trimmed;
}

export function diffRecord(
  before: NormalizedRecord | null,
  after: Partial<RecordInput> & { hostName?: string | null },
): FieldChange[] {
  const changes: FieldChange[] = [];
  const push = (field: string, prev: unknown, next: unknown) => {
    const left = prev ?? null;
    const right = next ?? null;
    if (String(left ?? "") === String(right ?? "") && typeof left === typeof right) return;
    if (left === right) return;
    changes.push({ field, label: LABELS[field] ?? field, before: left, after: right });
  };

  if (!before) {
    const draft: Array<[string, unknown]> = [
      ["name", after.name ? normalizeRecordName(after.name) : undefined],
      ["type", after.type],
      ["value", after.value],
      ["ttl", after.ttl],
      ["line", after.line],
      ["priority", after.priority],
      ["weight", after.weight],
      ["remark", after.remark],
    ];
    for (const [field, value] of draft) {
      if (value === undefined || value === null || value === "") continue;
      changes.push({ field, label: LABELS[field] ?? field, before: null, after: value });
    }
    if (after.hostName) {
      changes.push({ field: "host", label: LABELS.host, before: null, after: after.hostName });
    }
    return changes;
  }

  if (after.name !== undefined) push("name", normalizeRecordName(before.name), normalizeRecordName(after.name));
  if (after.type !== undefined) push("type", before.type, after.type.toUpperCase());
  if (after.value !== undefined) {
    push("value", canonicalValue(before.type, before.value), canonicalValue(after.type ?? before.type, after.value));
  }
  if (after.ttl !== undefined) push("ttl", before.ttl, after.ttl);
  if (after.line !== undefined) push("line", before.line.code || before.line.label, after.line);
  if (after.priority !== undefined) push("priority", before.priority, after.priority);
  if (after.weight !== undefined) push("weight", before.weight, after.weight);
  if (after.status !== undefined) push("status", before.status, after.status);
  if (after.remark !== undefined) push("remark", before.remark, after.remark);
  if (after.hostName !== undefined) push("host", before.host?.hostName ?? null, after.hostName);

  return changes;
}

export function hasChanges(changes: FieldChange[]): boolean {
  return changes.length > 0;
}

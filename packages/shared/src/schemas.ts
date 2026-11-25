import { z } from "zod";
import { normalizeIp } from "./ip.js";
import { RECORD_TYPES } from "./record-types.js";

const addressTypes = ["A", "AAAA"];

export const recordTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .transform((v) => v.toUpperCase());

export const recordNameSchema = z
  .string()
  .trim()
  .max(253)
  .regex(
    /^(\*|@|[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?(\.[a-zA-Z0-9_]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?)*)?$/,
    "主机记录格式不合法：可填 @、www、api.v2 或 *",
  );

const recordFields = {
  name: recordNameSchema,
  type: recordTypeSchema,
  value: z.string().trim().min(1, "记录值不能为空").max(4096),
  ttl: z.coerce.number().int().min(1).max(604800),
  line: z.string().trim().max(64).optional(),
  lineId: z.string().trim().max(64).optional(),
  priority: z.coerce.number().int().min(0).max(65535).optional(),
  weight: z.coerce.number().int().min(0).max(100).optional(),
  status: z.enum(["ENABLE", "DISABLE"]).optional(),
  remark: z.string().trim().max(255).optional(),
  hostAddressId: z.string().trim().min(1).nullable().optional(),
  hostName: z.string().trim().max(64).optional(),
};

function refineRecord(value: z.infer<z.ZodObject<typeof recordFields>>, ctx: z.RefinementCtx) {
  if (value.hostAddressId) {
    if (!addressTypes.includes(value.type)) {
      ctx.addIssue({ code: "custom", path: ["hostAddressId"], message: "只有 A / AAAA 记录可以绑定主机" });
    }
    const parsed = normalizeIp(value.value);
    if (!parsed.ok) ctx.addIssue({ code: "custom", path: ["value"], message: parsed.reason });
  }
  if (addressTypes.includes(value.type)) {
    const parsed = normalizeIp(value.value);
    if (!parsed.ok) ctx.addIssue({ code: "custom", path: ["value"], message: parsed.reason });
  }
  if (value.type === "MX" && value.priority === undefined) {
    ctx.addIssue({ code: "custom", path: ["priority"], message: "MX 记录必须指定优先级" });
  }
}

export const createRecordSchema = z.object(recordFields).superRefine(refineRecord);

export const updateRecordSchema = z
  .object({ ...recordFields, beforeRemoteUpdatedAt: z.string().trim().max(64).optional() })
  .superRefine(refineRecord);

export const recordStatusSchema = z.object({ status: z.enum(["ENABLE", "DISABLE"]) });

export const addressInputSchema = z.object({
  ip: z.string().trim().min(1, "IP 不能为空"),
  scope: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
  isPrimary: z.boolean().optional(),
});

export const hostInputSchema = z
  .object({
    name: z.string().trim().min(1, "主机名必填").max(64),
    remark: z.string().trim().max(255).optional(),
    tags: z.array(z.string().trim().min(1).max(32)).max(20).default([]),
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
    addresses: z.array(addressInputSchema).min(1, "至少填写一个 IP").max(40),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.addresses.forEach((addr, index) => {
      const parsed = normalizeIp(addr.ip);
      if (!parsed.ok) {
        ctx.addIssue({ code: "custom", path: ["addresses", index, "ip"], message: parsed.reason });
        return;
      }
      if (seen.has(parsed.ip)) {
        ctx.addIssue({ code: "custom", path: ["addresses", index, "ip"], message: "同一主机的 IP 不能重复" });
      }
      seen.add(parsed.ip);
    });
    if (value.addresses.filter((a) => a.isPrimary).length > 1) {
      ctx.addIssue({ code: "custom", path: ["addresses"], message: "只能有一个主地址" });
    }
  });

export const hostPatchSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  remark: z.string().trim().max(255).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const hostImportSchema = z.object({ text: z.string().min(1, "粘贴内容为空").max(20000) });

export const accountCreateSchema = z.object({
  provider: z.enum(["aliyun", "tencent"]),
  name: z.string().trim().min(1, "备注名必填").max(64),
  accessKeyId: z.string().trim().min(1, "AccessKeyId 必填").max(128),
  accessKeySecret: z.string().trim().min(1, "AccessKeySecret 必填").max(256),
  readonly: z.boolean().optional(),
});

export const accountPatchSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  accessKeyId: z.string().trim().min(1).max(128).optional(),
  accessKeySecret: z.string().trim().min(1).max(256).optional(),
  readonly: z.boolean().optional(),
});

export const hostRolloutPlanSchema = z.object({ newIp: z.string().trim().min(1) });

export const hostRolloutApplySchema = z.object({
  newIp: z.string().trim().min(1),
  expectedCount: z.coerce.number().int().min(0),
});

export const knownRecordTypes = RECORD_TYPES;

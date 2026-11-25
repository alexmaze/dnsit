import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

/**
 * 回归测试：@alicloud/alidns20150109@4.6.1 的 package.json main 只导出 Client，
 * 请求模型类在 dist/models/model.js 里（.d.ts 却声称从包根导出）。
 * 适配器依赖这些类的 validate()，SDK 升级若换了布局，这里会先炸。
 */
describe("aliyun sdk packaging", () => {
  const required = [
    "DescribeDomainsRequest",
    "DescribeDomainRecordsRequest",
    "DescribeDomainRecordInfoRequest",
    "DescribeDomainInfoRequest",
    "AddDomainRecordRequest",
    "UpdateDomainRecordRequest",
    "UpdateDomainRecordRemarkRequest",
    "DeleteDomainRecordRequest",
    "SetDomainRecordStatusRequest",
  ];

  it("exposes every request model class the adapter uses", () => {
    const nodeRequire = createRequire(import.meta.url);
    const models = nodeRequire("@alicloud/alidns20150109/dist/models/model.js") as Record<string, unknown>;
    for (const name of required) {
      expect(typeof models[name], `缺少请求模型 ${name}`).toBe("function");
    }
  });

  it("gives request instances a validate() method", () => {
    const nodeRequire = createRequire(import.meta.url);
    const models = nodeRequire("@alicloud/alidns20150109/dist/models/model.js") as Record<
      string,
      new (body?: Record<string, unknown>) => { validate?: unknown }
    >;
    const Ctor = models.DescribeDomainsRequest!;
    expect(typeof new Ctor({ pageNumber: 1, pageSize: 1 }).validate).toBe("function");
  });
});

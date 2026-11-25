import type { ProviderKind } from "@dnsit/shared";
import { HttpError } from "../errors.js";
import { AliyunProvider } from "./aliyun.js";
import type { Credentials, DnsProvider } from "./contract.js";
import { TencentProvider } from "./tencent.js";

export * from "./contract.js";

export interface ProviderOptions {
  accountId: string;
  aliyunQps: number;
  tencentQps: number;
}

export function createProvider(
  kind: ProviderKind,
  credentials: Credentials,
  options: ProviderOptions,
): DnsProvider {
  if (kind === "aliyun") {
    return new AliyunProvider(credentials, { accountId: options.accountId, qps: options.aliyunQps });
  }
  if (kind === "tencent") {
    return new TencentProvider(credentials, { accountId: options.accountId, qps: options.tencentQps });
  }
  throw new HttpError(400, "UNKNOWN_PROVIDER", `不支持的云厂商：${kind}`);
}

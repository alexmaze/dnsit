import AliDnsModule from "@alicloud/alidns20150109";
import type { ProviderKind, RawRecord, RawZone, RecordInput } from "@dnsit/shared";
import { ProviderError } from "../errors.js";
import type { Credentials, DnsProvider, LineOption, ProviderCapabilities, ZoneRef } from "./contract.js";
import { withAccountQueue, withRetry } from "./throttle.js";

const LINE_LABELS: Record<string, string> = {
  default: "默认",
  telecom: "电信",
  unicom: "联通",
  mobile: "移动",
  edu: "教育网",
  drpeng: "鹏博士",
  btvn: "广电",
  oversea: "海外",
  search: "搜索引擎",
};

function lineLabel(code: string): string {
  return LINE_LABELS[code] ?? code;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface AliyunResponse<T = any> {
  body?: T;
}

interface AliyunClient {
  describeDomains(req: Record<string, unknown>): Promise<AliyunResponse>;
  describeDomainRecords(req: Record<string, unknown>): Promise<AliyunResponse>;
  describeDomainRecordInfo(req: Record<string, unknown>): Promise<AliyunResponse>;
  describeDomainInfo(req: Record<string, unknown>): Promise<AliyunResponse>;
  addDomainRecord(req: Record<string, unknown>): Promise<AliyunResponse>;
  updateDomainRecord(req: Record<string, unknown>): Promise<AliyunResponse>;
  updateDomainRecordRemark(req: Record<string, unknown>): Promise<AliyunResponse>;
  deleteDomainRecord(req: Record<string, unknown>): Promise<AliyunResponse>;
  setDomainRecordStatus(req: Record<string, unknown>): Promise<AliyunResponse>;
}

const AliDnsCtor = ((AliDnsModule as unknown as { default?: unknown }).default ??
  AliDnsModule) as new (config: Record<string, unknown>) => AliyunClient;

interface AliyunRecordShape {
  recordId?: string;
  RR?: string;
  type?: string;
  value?: string;
  TTL?: number;
  line?: string;
  priority?: number;
  weight?: number;
  status?: string;
  remark?: string;
  updateTimestamp?: number;
}

function mapRecord(raw: AliyunRecordShape): RawRecord {
  return {
    remoteId: String(raw.recordId ?? ""),
    name: raw.RR && raw.RR.length > 0 ? raw.RR : "@",
    type: (raw.type ?? "A").toUpperCase(),
    value: raw.value ?? "",
    ttl: raw.TTL ?? 600,
    line: raw.line ?? "default",
    priority: raw.priority,
    weight: raw.weight,
    status: (raw.status ?? "ENABLE").toUpperCase() === "DISABLE" ? "DISABLE" : "ENABLE",
    remark: raw.remark,
    remoteUpdatedAt: raw.updateTimestamp ? new Date(raw.updateTimestamp * 1000).toISOString() : undefined,
  };
}

export function normalizeAliyunError(error: unknown): ProviderError {
  const err = error as { code?: string; message?: string; data?: { RequestId?: string }; requestId?: string; statusCode?: number };
  const code = err?.code ?? "UNKNOWN";
  const message = err?.message ?? "阿里云接口调用失败";
  const requestId = err?.data?.RequestId ?? err?.requestId;
  if (/^Throttling/i.test(code)) return new ProviderError("RATE_LIMITED", "阿里云接口被限流，请稍后重试", code, requestId, true);
  if (/^(InvalidAccessKeyId|SignatureDoesNotMatch|Forbidden|NoPermission|InvalidSecurityToken)/i.test(code)) {
    return new ProviderError("AUTH_INVALID", "阿里云 AK/SK 无效或权限不足", code, requestId);
  }
  if (/DomainNotExist|DomainRecordNotBelongToUser|InvalidDomainName/i.test(code)) {
    return new ProviderError("NOT_FOUND", "域名或记录不存在", code, requestId);
  }
  if (/Duplicate|RecordExist|Conflict/i.test(code)) {
    return new ProviderError("CONFLICT", "记录已存在或与现有记录冲突", code, requestId);
  }
  if (/Quota|LimitExceeded|CountLimit/i.test(code)) {
    return new ProviderError("QUOTA_EXCEEDED", "超出阿里云套餐配额限制", code, requestId);
  }
  if (/^Invalid|^Missing/i.test(code)) {
    return new ProviderError("INVALID_PARAM", message, code, requestId);
  }
  if (err?.statusCode && err.statusCode >= 500) {
    return new ProviderError("NETWORK", "阿里云服务暂时不可用", code, requestId, true);
  }
  if (error instanceof TypeError || (error as { code?: string })?.code === "ECONNRESET") {
    return new ProviderError("NETWORK", "网络异常，请检查本机网络", code, requestId, true);
  }
  return new ProviderError("UNKNOWN", message, code, requestId);
}

export class AliyunProvider implements DnsProvider {
  readonly kind: ProviderKind = "aliyun";
  readonly capabilities: ProviderCapabilities = {
    batch: false,
    remark: true,
    weight: false,
    recordTypeList: false,
    lineList: true,
  };

  private readonly client: AliyunClient;

  constructor(
    credentials: Credentials,
    private readonly options: { accountId: string; qps: number },
  ) {
    this.client = new AliDnsCtor({
      accessKeyId: credentials.accessKeyId,
      accessKeySecret: credentials.accessKeySecret,
      endpoint: "alidns.aliyuncs.com",
    });
  }

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const interval = 1000 / Math.max(1, this.options.qps);
    return withAccountQueue(this.options.accountId, interval, () =>
      withRetry(async () => {
        try {
          return await fn();
        } catch (error) {
          throw normalizeAliyunError(error);
        }
      }),
    );
  }

  async verify(): Promise<void> {
    await this.run(() => this.client.describeDomains({ pageNumber: 1, pageSize: 1 }));
  }

  async listZones(): Promise<RawZone[]> {
    const zones: RawZone[] = [];
    let page = 1;
    for (;;) {
      const response = await this.run(() => this.client.describeDomains({ pageNumber: page, pageSize: 100 }));
      const body = response.body;
      const list = body?.domains?.domain ?? [];
      for (const item of list) {
        if (!item.domainName) continue;
        zones.push({
          name: item.domainName,
          remoteZoneId: item.domainId,
          recordCount: item.recordCount ?? 0,
          gradeTitle: item.versionName,
          vipEndAt: item.instanceEndTime,
          status: item.instanceExpired ? "EXPIRED" : "ENABLE",
        });
      }
      const total = body?.totalCount ?? 0;
      if (list.length === 0 || zones.length >= total) break;
      page += 1;
    }
    return zones;
  }

  async listRecords(zone: ZoneRef): Promise<RawRecord[]> {
    const records: RawRecord[] = [];
    let page = 1;
    for (;;) {
      const response = await this.run(() =>
        this.client.describeDomainRecords({ domainName: zone.name, pageNumber: page, pageSize: 500 }),
      );
      const body = response.body;
      const list = body?.domainRecords?.record ?? [];
      for (const item of list) records.push(mapRecord(item as AliyunRecordShape));
      const total = body?.totalCount ?? 0;
      if (list.length === 0 || records.length >= total) break;
      page += 1;
    }
    return records;
  }

  async getRecord(_zone: ZoneRef, remoteId: string): Promise<RawRecord> {
    const response = await this.run(() => this.client.describeDomainRecordInfo({ recordId: remoteId }));
    return mapRecord(response.body as AliyunRecordShape);
  }

  async createRecord(zone: ZoneRef, input: RecordInput): Promise<RawRecord> {
    const response = await this.run(() =>
      this.client.addDomainRecord({
        domainName: zone.name,
        RR: input.name === "@" ? "@" : input.name,
        type: input.type,
        value: input.value,
        TTL: input.ttl,
        line: input.line,
        priority: input.type === "MX" ? input.priority : undefined,
      }),
    );
    const recordId = response.body?.recordId;
    if (!recordId) throw new ProviderError("UNKNOWN", "阿里云未返回记录 ID", "NoRecordId");
    return this.getRecord(zone, recordId);
  }

  async updateRecord(zone: ZoneRef, remoteId: string, input: RecordInput): Promise<RawRecord> {
    await this.run(() =>
      this.client.updateDomainRecord({
        recordId: remoteId,
        RR: input.name === "@" ? "@" : input.name,
        type: input.type,
        value: input.value,
        TTL: input.ttl,
        line: input.line,
        priority: input.type === "MX" ? input.priority : undefined,
      }),
    );
    if (input.remark !== undefined) {
      try {
        await this.run(() => this.client.updateDomainRecordRemark({ recordId: remoteId, remark: input.remark }));
      } catch {
        // 备注是第二步，失败不回滚主记录
      }
    }
    return this.getRecord(zone, remoteId);
  }

  async deleteRecord(_zone: ZoneRef, remoteId: string): Promise<void> {
    await this.run(() => this.client.deleteDomainRecord({ recordId: remoteId }));
  }

  async setStatus(_zone: ZoneRef, remoteId: string, status: "ENABLE" | "DISABLE"): Promise<void> {
    await this.run(() => this.client.setDomainRecordStatus({ recordId: remoteId, status }));
  }

  async listLines(zone: ZoneRef): Promise<LineOption[]> {
    const response = await this.run(() => this.client.describeDomainInfo({ domainName: zone.name }));
    const lines = (response.body?.recordLines?.recordLine ?? []) as Array<{
      lineCode?: string;
      lineName?: string;
      lineDisplayName?: string;
    }>;
    return lines
      .filter((line) => line.lineCode)
      .map((line) => ({
        code: line.lineCode!,
        label: line.lineName ?? lineLabel(line.lineCode!),
      }));
  }

  async listRecordTypes(): Promise<string[]> {
    return ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "REDIRECT_URL", "FORWORD_URL"];
  }
}

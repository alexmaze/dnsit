import tencentcloud from "tencentcloud-sdk-nodejs-dnspod";
import type { ProviderKind, RawRecord, RawZone, RecordInput } from "@dnsit/shared";
import { ProviderError } from "../errors.js";
import type { Credentials, DnsProvider, LineOption, ProviderCapabilities, ZoneRef } from "./contract.js";
import { withAccountQueue, withRetry } from "./throttle.js";

const { Client } = tencentcloud.dnspod.v20210323;
type TxClient = InstanceType<typeof Client>;

const DEFAULT_LINE = "默认";

interface TencentRecordShape {
  RecordId?: number;
  Id?: number;
  Name?: string;
  SubDomain?: string;
  Type?: string;
  RecordType?: string;
  Value?: string;
  TTL?: number;
  Line?: string;
  RecordLine?: string;
  LineId?: string;
  RecordLineId?: string;
  MX?: number;
  Weight?: number;
  Status?: string;
  Enabled?: number;
  Remark?: string;
  UpdatedOn?: string;
}

function mapRecord(raw: TencentRecordShape): RawRecord {
  const enabled = raw.Status ? raw.Status.toUpperCase() !== "DISABLE" : (raw.Enabled ?? 1) === 1;
  const lineText = raw.RecordLine ?? raw.Line ?? DEFAULT_LINE;
  return {
    remoteId: String(raw.RecordId ?? raw.Id ?? ""),
    name: raw.SubDomain ?? raw.Name ?? "@",
    type: (raw.RecordType ?? raw.Type ?? "A").toUpperCase(),
    value: raw.Value ?? "",
    ttl: raw.TTL ?? 600,
    line: lineText,
    lineId: raw.RecordLineId ?? raw.LineId,
    priority: raw.MX,
    weight: raw.Weight,
    status: enabled ? "ENABLE" : "DISABLE",
    remark: raw.Remark,
    remoteUpdatedAt: raw.UpdatedOn,
  };
}

export function normalizeTencentError(error: unknown): ProviderError {
  const err = error as { code?: string; message?: string; requestId?: string; statusCode?: number };
  const code = err?.code ?? "UNKNOWN";
  const message = err?.message ?? "腾讯云接口调用失败";
  const requestId = err?.requestId;
  if (/^RequestLimitExceeded/i.test(code)) {
    return new ProviderError("RATE_LIMITED", "腾讯云接口被限流，请稍后重试", code, requestId, true);
  }
  if (/^(AuthFailure|UnauthorizedOperation|InvalidCredential)/i.test(code)) {
    return new ProviderError("AUTH_INVALID", "腾讯云 AK/SK 无效或权限不足", code, requestId);
  }
  if (/DomainNotExist|NoDataOfRecord|ResourceNotFound/i.test(code)) {
    return new ProviderError("NOT_FOUND", "域名或记录不存在", code, requestId);
  }
  if (/Exist|Duplicate|Conflict/i.test(code)) {
    return new ProviderError("CONFLICT", "记录已存在或与现有记录冲突", code, requestId);
  }
  if (/LimitExceeded|Quota|CountLimit|PackageLimit/i.test(code)) {
    return new ProviderError("QUOTA_EXCEEDED", "超出腾讯云套餐配额限制", code, requestId);
  }
  if (/^InvalidParameter/i.test(code)) {
    return new ProviderError("INVALID_PARAM", message, code, requestId);
  }
  if (/^InternalError/i.test(code) || (err?.statusCode ?? 0) >= 500) {
    return new ProviderError("NETWORK", "腾讯云服务暂时不可用", code, requestId, true);
  }
  return new ProviderError("UNKNOWN", message, code, requestId);
}

export class TencentProvider implements DnsProvider {
  readonly kind: ProviderKind = "tencent";
  readonly capabilities: ProviderCapabilities = {
    batch: true,
    remark: true,
    weight: true,
    recordTypeList: true,
    lineList: true,
  };

  private readonly client: TxClient;

  constructor(
    credentials: Credentials,
    private readonly options: { accountId: string; qps: number },
  ) {
    this.client = new Client({
      credential: { secretId: credentials.accessKeyId, secretKey: credentials.accessKeySecret },
      region: "",
      profile: {
        httpProfile: { endpoint: "dnspod.tencentcloudapi.com", reqTimeout: 30 },
      },
    });
  }

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const interval = 1000 / Math.max(1, this.options.qps);
    return withAccountQueue(this.options.accountId, interval, () =>
      withRetry(async () => {
        try {
          return await fn();
        } catch (error) {
          throw normalizeTencentError(error);
        }
      }),
    );
  }

  async verify(): Promise<void> {
    await this.run(() => this.client.DescribeDomainList({ Offset: 0, Limit: 1 }));
  }

  async listZones(): Promise<RawZone[]> {
    const zones: RawZone[] = [];
    let offset = 0;
    for (;;) {
      const response = await this.run(() => this.client.DescribeDomainList({ Offset: offset, Limit: 100 }));
      const list = response.DomainList ?? [];
      for (const item of list) {
        if (!item.Name) continue;
        zones.push({
          name: item.Name,
          remoteZoneId: item.DomainId != null ? String(item.DomainId) : undefined,
          recordCount: item.RecordCount ?? 0,
          gradeTitle: item.GradeTitle,
          vipEndAt: item.VipEndAt,
          status: item.Status,
          defaultTtl: item.TTL,
        });
      }
      offset += list.length;
      const total = response.DomainCountInfo?.AllTotal ?? response.DomainCountInfo?.DomainTotal ?? 0;
      if (list.length === 0 || offset >= total) break;
    }
    return zones;
  }

  async listRecords(zone: ZoneRef): Promise<RawRecord[]> {
    const records: RawRecord[] = [];
    let offset = 0;
    for (;;) {
      const response = await this.run(() =>
        this.client.DescribeRecordList({ Domain: zone.name, Offset: offset, Limit: 500 }),
      );
      const list = response.RecordList ?? [];
      for (const item of list) records.push(mapRecord(item as TencentRecordShape));
      offset += list.length;
      const total = response.RecordCountInfo?.TotalCount ?? 0;
      if (list.length === 0 || offset >= total) break;
    }
    return records;
  }

  async getRecord(zone: ZoneRef, remoteId: string): Promise<RawRecord> {
    const response = await this.run(() =>
      this.client.DescribeRecord({ Domain: zone.name, RecordId: Number(remoteId) }),
    );
    return mapRecord((response.RecordInfo ?? {}) as TencentRecordShape);
  }

  async createRecord(zone: ZoneRef, input: RecordInput): Promise<RawRecord> {
    const response = await this.run(() =>
      this.client.CreateRecord({
        Domain: zone.name,
        SubDomain: input.name === "@" ? "@" : input.name,
        RecordType: input.type,
        RecordLine: input.line ?? DEFAULT_LINE,
        RecordLineId: input.lineId,
        Value: input.value,
        TTL: input.ttl,
        MX: input.type === "MX" ? input.priority : undefined,
        Weight: input.weight,
        Status: input.status,
        Remark: input.remark,
      }),
    );
    const recordId = response.RecordId;
    if (recordId == null) throw new ProviderError("UNKNOWN", "腾讯云未返回记录 ID", "NoRecordId");
    return this.getRecord(zone, String(recordId));
  }

  async updateRecord(zone: ZoneRef, remoteId: string, input: RecordInput): Promise<RawRecord> {
    await this.run(() =>
      this.client.ModifyRecord({
        Domain: zone.name,
        RecordId: Number(remoteId),
        SubDomain: input.name === "@" ? "@" : input.name,
        RecordType: input.type,
        RecordLine: input.line ?? DEFAULT_LINE,
        RecordLineId: input.lineId,
        Value: input.value,
        TTL: input.ttl,
        MX: input.type === "MX" ? input.priority : undefined,
        Weight: input.weight,
        Status: input.status,
        Remark: input.remark,
      }),
    );
    return this.getRecord(zone, remoteId);
  }

  async deleteRecord(zone: ZoneRef, remoteId: string): Promise<void> {
    await this.run(() => this.client.DeleteRecord({ Domain: zone.name, RecordId: Number(remoteId) }));
  }

  async setStatus(zone: ZoneRef, remoteId: string, status: "ENABLE" | "DISABLE"): Promise<void> {
    await this.run(() =>
      this.client.ModifyRecordStatus({ Domain: zone.name, RecordId: Number(remoteId), Status: status }),
    );
  }

  async listLines(zone: ZoneRef): Promise<LineOption[]> {
    try {
      const response = await this.run(() =>
        this.client.DescribeRecordLineList({ Domain: zone.name, DomainGrade: "DP_FREE" }),
      );
      const lines = response.LineList ?? [];
      const mapped = lines
        .filter((line) => line.Name)
        .map((line) => ({ code: line.Name, label: line.Name, id: line.LineId != null ? String(line.LineId) : undefined }));
      if (mapped.length > 0) return mapped;
    } catch {
      // 套餐不匹配时回退到默认线路
    }
    return [{ code: DEFAULT_LINE, label: DEFAULT_LINE }];
  }

  async listRecordTypes(zone: ZoneRef): Promise<string[]> {
    try {
      const response = await this.run(() => this.client.DescribeRecordType({ DomainGrade: "DP_FREE" }));
      const types = response.TypeList ?? [];
      if (types.length > 0) return types;
    } catch {
      // 权限不足或接口变更时回退到内置列表
    }
    return ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"];
  }
}

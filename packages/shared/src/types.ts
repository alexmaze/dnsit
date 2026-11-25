export type ProviderKind = "aliyun" | "tencent";

export type RecordStatus = "ENABLE" | "DISABLE";

export type DriftState = "NONE" | "VALUE_CHANGED" | "RECORD_GONE";

export interface HostLinkInfo {
  addressId: string;
  hostId: string;
  hostName: string;
  ip: string;
  drift: DriftState;
}

export interface NormalizedRecord {
  id: string;
  zoneId: string;
  remoteId: string;
  name: string;
  fqdn: string;
  type: string;
  value: string;
  ttl: number;
  line: { code: string; label: string };
  lineId?: string;
  priority?: number;
  weight?: number;
  status: RecordStatus;
  remark?: string;
  remoteUpdatedAt?: string;
  host?: HostLinkInfo;
}

export interface AccountSummary {
  id: string;
  provider: ProviderKind;
  name: string;
  accessKeyMasked: string;
  readonly: boolean;
  status: "unverified" | "ok" | "invalid";
  lastVerifiedAt?: string;
  lastError?: string;
  zoneCount: number;
}

export interface ZoneSummary {
  id: string;
  accountId: string;
  accountName: string;
  provider: ProviderKind;
  name: string;
  recordCount: number;
  gradeTitle?: string;
  vipEndAt?: string;
  status?: string;
  defaultTtl?: number;
  lastSyncedAt?: string;
}

export interface HostAddressDTO {
  id: string;
  ip: string;
  version: number;
  scope: "PUBLIC" | "PRIVATE";
  isPrimary: boolean;
}

export interface HostDTO {
  id: string;
  name: string;
  remark?: string;
  tags: string[];
  status: "ACTIVE" | "INACTIVE";
  addresses: HostAddressDTO[];
  recordCount?: number;
  driftCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface HostUsageRow {
  zoneId: string;
  zoneName: string;
  accountId: string;
  accountName: string;
  provider: ProviderKind;
  recordId: string;
  name: string;
  fqdn: string;
  type: string;
  value: string;
  line: string;
  status: RecordStatus;
  drift: DriftState;
  syncedAt?: string;
}

export interface RecordInput {
  name: string;
  type: string;
  value: string;
  ttl: number;
  line?: string;
  lineId?: string;
  priority?: number;
  weight?: number;
  status?: RecordStatus;
  remark?: string;
  hostAddressId?: string | null;
}

export interface RawZone {
  name: string;
  remoteZoneId?: string;
  recordCount?: number;
  gradeTitle?: string;
  vipEndAt?: string;
  status?: string;
  defaultTtl?: number;
}

export interface RawRecord {
  remoteId: string;
  name: string;
  type: string;
  value: string;
  ttl: number;
  line?: string;
  lineId?: string;
  priority?: number;
  weight?: number;
  status: RecordStatus;
  remark?: string;
  remoteUpdatedAt?: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  providerCode?: string;
  requestId?: string;
  retryable?: boolean;
  details?: unknown;
}

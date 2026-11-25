import type { ProviderKind, RawRecord, RawZone, RecordInput } from "@dnsit/shared";

export interface ZoneRef {
  name: string;
  remoteZoneId?: string;
}

export interface Credentials {
  accessKeyId: string;
  accessKeySecret: string;
}

export interface ProviderCapabilities {
  batch: boolean;
  remark: boolean;
  weight: boolean;
  recordTypeList: boolean;
  lineList: boolean;
}

export interface LineOption {
  code: string;
  label: string;
  id?: string;
}

export interface DnsProvider {
  readonly kind: ProviderKind;
  readonly capabilities: ProviderCapabilities;
  verify(): Promise<void>;
  listZones(): Promise<RawZone[]>;
  listRecords(zone: ZoneRef): Promise<RawRecord[]>;
  getRecord(zone: ZoneRef, remoteId: string): Promise<RawRecord>;
  createRecord(zone: ZoneRef, input: RecordInput): Promise<RawRecord>;
  updateRecord(zone: ZoneRef, remoteId: string, input: RecordInput): Promise<RawRecord>;
  deleteRecord(zone: ZoneRef, remoteId: string): Promise<void>;
  setStatus(zone: ZoneRef, remoteId: string, status: "ENABLE" | "DISABLE"): Promise<void>;
  listLines(zone: ZoneRef): Promise<LineOption[]>;
  listRecordTypes(zone: ZoneRef): Promise<string[]>;
}

import { isAddressType, sameIp } from "@dnsit/shared";
import type { DriftState } from "@dnsit/shared";
import type { Db } from "../db.js";
import { HttpError } from "../errors.js";
import { getAddressRow, getRecordRow, listLinksByZone, setLinkRow, updateLinkDrift } from "../repo.js";

export function computeDrift(recordValue: string | undefined, addressIp: string | undefined, type: string | undefined): DriftState {
  if (recordValue === undefined || addressIp === undefined) return "RECORD_GONE";
  if (!type || !isAddressType(type)) return "VALUE_CHANGED";
  return sameIp(recordValue, addressIp) ? "NONE" : "VALUE_CHANGED";
}

export function recomputeZoneDrift(db: Db, zoneId: string): void {
  for (const link of listLinksByZone(db, zoneId)) {
    const record = getRecordRow(db, zoneId, link.remote_record_id);
    const address = getAddressRow(db, link.host_address_id);
    if (!record) {
      updateLinkDrift(db, zoneId, link.remote_record_id, "RECORD_GONE");
      continue;
    }
    updateLinkDrift(db, zoneId, link.remote_record_id, computeDrift(record.value, address?.ip, record.type));
  }
}

export function bindRecordToAddress(
  db: Db,
  zoneId: string,
  remoteRecordId: string,
  addressId: string,
  recordValue: string,
  recordType: string,
): void {
  const address = getAddressRow(db, addressId);
  if (!address) throw new HttpError(422, "HOST_ADDRESS_NOT_FOUND", "选择的主机地址不存在");
  if (!isAddressType(recordType)) {
    throw new HttpError(422, "HOST_LINK_TYPE", "只有 A / AAAA 记录可以绑定主机");
  }
  if (!sameIp(recordValue, address.ip)) {
    throw new HttpError(422, "HOST_IP_MISMATCH", `记录值 ${recordValue} 与主机 IP ${address.ip} 不一致`);
  }
  setLinkRow(db, zoneId, remoteRecordId, addressId, "NONE");
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AccountSummary,
  HostDTO,
  HostUsageRow,
  HttpsCheckResult,
  NormalizedRecord,
  ZoneSummary,
} from "@dnsit/shared";
import { api } from "./client.js";

export interface RecordsPayload {
  records: NormalizedRecord[];
  syncedAt?: string;
  zoneName: string;
}

export interface AuditEntry {
  id: string;
  zoneName: string;
  action: string;
  result: string;
  errorCode?: string;
  errorMessage?: string;
  requestId?: string;
  createdAt: string;
  before?: unknown;
  after?: unknown;
}

export function useAccounts() {
  return useQuery({ queryKey: ["accounts"], queryFn: () => api.get<AccountSummary[]>("/accounts") });
}

export function useZones(refresh = false) {
  return useQuery({
    queryKey: ["zones", refresh],
    queryFn: () => api.get<ZoneSummary[]>(`/zones${refresh ? "?refresh=1" : ""}`),
    staleTime: 30_000,
  });
}

export function useZoneRecords(zoneId: string | undefined, refreshToken = 0) {
  return useQuery({
    queryKey: ["zone", zoneId, "records", refreshToken],
    queryFn: () => api.get<RecordsPayload>(`/zones/${zoneId}/records${refreshToken ? "?refresh=1" : ""}`),
    enabled: Boolean(zoneId),
    staleTime: 60_000,
  });
}

export function useHosts() {
  return useQuery({ queryKey: ["hosts"], queryFn: () => api.get<HostDTO[]>("/hosts") });
}

export function useHost(id: string | undefined) {
  return useQuery({
    queryKey: ["host", id],
    queryFn: () => api.get<HostDTO>(`/hosts/${id}`),
    enabled: Boolean(id),
  });
}

export function useHostUsage(id: string | undefined) {
  return useQuery({
    queryKey: ["host", id, "records"],
    queryFn: () => api.get<HostUsageRow[]>(`/hosts/${id}/records`),
    enabled: Boolean(id),
  });
}

export function useZoneLines(zoneId: string | undefined) {
  return useQuery({
    queryKey: ["zone", zoneId, "lines"],
    queryFn: () => api.get<Array<{ code: string; label: string; id?: string }>>(`/zones/${zoneId}/lines`),
    enabled: Boolean(zoneId),
    staleTime: 3_600_000,
    retry: false,
  });
}

export function checkDomainHttps(domain: string) {
  return api.post<HttpsCheckResult>("/https-check", { domain });
}

export function useAudit(page: number) {
  return useQuery({
    queryKey: ["audit", page],
    queryFn: () => api.get<{ items: AuditEntry[]; total: number }>(`/audit?page=${page}&pageSize=50`),
  });
}

export function useInvalidate() {
  const client = useQueryClient();
  return {
    zones: () => client.invalidateQueries({ queryKey: ["zones"] }),
    records: (zoneId?: string) =>
      zoneId
        ? client.invalidateQueries({ queryKey: ["zone", zoneId] })
        : client.invalidateQueries({ queryKey: ["zone"] }),
    hosts: () => client.invalidateQueries({ queryKey: ["hosts"] }),
    host: (id?: string) =>
      id ? client.invalidateQueries({ queryKey: ["host", id] }) : client.invalidateQueries({ queryKey: ["host"] }),
    audit: () => client.invalidateQueries({ queryKey: ["audit"] }),
    all: () => client.invalidateQueries(),
  };
}

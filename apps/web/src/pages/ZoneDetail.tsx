import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { GitBranch, Plus, RefreshCw, Search, Table2 } from "lucide-react";
import { toast } from "sonner";
import { buildZoneTree, knownRecordTypes } from "@dnsit/shared";
import type { NormalizedRecord } from "@dnsit/shared";
import { api, errorMessage } from "@/api/client";
import { useZoneRecords, useZones } from "@/api/queries";
import { CnameTree } from "@/components/CnameTree";
import { DeleteRecordDialog } from "@/components/DeleteRecordDialog";
import { RecordDialog } from "@/components/RecordDialog";
import { RecordTable } from "@/components/RecordTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { relativeTime, PROVIDER_LABEL } from "@/lib/format";

export function ZoneDetail() {
  const { zoneId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "table" ? "table" : "tree";

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [refreshToken, setRefreshToken] = useState(0);
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; record?: NormalizedRecord } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NormalizedRecord | null>(null);

  const zones = useZones();
  const zone = zones.data?.find((item) => item.id === zoneId);
  const recordsQuery = useZoneRecords(zoneId, refreshToken);

  const records = recordsQuery.data?.records ?? [];

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return records.filter((record) => {
      if (typeFilter !== "ALL" && record.type !== typeFilter) return false;
      if (!keyword) return true;
      return (
        record.name.toLowerCase().includes(keyword) ||
        record.value.toLowerCase().includes(keyword) ||
        record.fqdn.toLowerCase().includes(keyword) ||
        (record.host?.hostName.toLowerCase().includes(keyword) ?? false)
      );
    });
  }, [records, query, typeFilter]);

  const platformZones = useMemo(
    () => (zones.data ?? []).map((item) => ({ name: item.name, zoneId: item.id })),
    [zones.data],
  );

  const tree = useMemo(
    () => buildZoneTree({ zoneName: zone?.name ?? "", records: filtered, platformZones }),
    [zone?.name, filtered, platformZones],
  );

  const types = useMemo(() => {
    const set = new Set(records.map((record) => record.type));
    return Array.from(set).sort();
  }, [records]);

  async function toggle(record: NormalizedRecord) {
    const next = record.status === "ENABLE" ? "DISABLE" : "ENABLE";
    try {
      await api.post(`/zones/${zoneId}/records/${record.remoteId}/status`, { status: next });
      toast.success(next === "ENABLE" ? "记录已启用" : "记录已停用");
      await queryClient.invalidateQueries({ queryKey: ["zone", zoneId] });
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    }
  }

  if (!zone && zones.isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!zone) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        域名不存在，或已被移除。
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="space-y-3 border-b border-border/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{zone.name}</h1>
              <Badge variant="outline" className="text-[10px]">
                {PROVIDER_LABEL[zone.provider] ?? zone.provider}
              </Badge>
              {zone.status && zone.status !== "ENABLE" ? (
                <Badge variant="destructive" className="text-[10px]">
                  {zone.status}
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {zone.accountName}
              {zone.gradeTitle ? ` · ${zone.gradeTitle}` : ""}
              {zone.vipEndAt ? ` · 套餐到期 ${zone.vipEndAt}` : ""}
              {` · ${records.length} 条记录 · 同步于 ${relativeTime(recordsQuery.data?.syncedAt ?? zone.lastSyncedAt)}`}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshToken(Date.now())}
              disabled={recordsQuery.isFetching}
            >
              <RefreshCw className={`size-3.5 ${recordsQuery.isFetching ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
              <Plus className="size-3.5" /> 新建记录
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={view}
            onValueChange={(next) => {
              const copy = new URLSearchParams(params);
              copy.set("view", next);
              setParams(copy, { replace: true });
            }}
          >
            <TabsList className="h-8">
              <TabsTrigger value="tree" className="gap-1 text-xs">
                <GitBranch className="size-3" /> 树形
              </TabsTrigger>
              <TabsTrigger value="table" className="gap-1 text-xs">
                <Table2 className="size-3" /> 表格
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索主机记录 / 值 / 主机名"
              className="h-8 w-64 pl-7 text-xs"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部类型</SelectItem>
              {(types.length > 0 ? types : [...knownRecordTypes]).map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {tree.stats.dangling > 0 ? (
            <Badge variant="destructive" className="text-[10px]">
              {tree.stats.dangling} 个未挂载目标
            </Badge>
          ) : null}
          {tree.stats.cycles > 0 ? (
            <Badge variant="destructive" className="text-[10px]">
              {tree.stats.cycles} 处循环引用
            </Badge>
          ) : null}
          {records.some((record) => record.host?.drift === "VALUE_CHANGED") ? (
            <Badge variant="outline" className="text-[10px] text-amber-500">
              有记录与主机 IP 不一致
            </Badge>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-auto px-4 py-3">
        {recordsQuery.isLoading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : recordsQuery.isError ? (
          <div className="mx-auto max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <p className="font-medium text-destructive">加载解析记录失败</p>
            <p className="mt-1 text-xs text-muted-foreground">{errorMessage(recordsQuery.error)}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setRefreshToken(Date.now())}>
              重试
            </Button>
          </div>
        ) : records.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            这个域名还没有任何解析记录，点右上角「新建记录」开始。
          </p>
        ) : view === "tree" ? (
          <CnameTree
            tree={tree}
            onEdit={(record) => setDialog({ mode: "edit", record })}
            onDelete={setPendingDelete}
            onToggle={toggle}
            onJumpZone={(targetZoneId) => navigate(`/zones/${targetZoneId}`)}
          />
        ) : (
          <RecordTable
            records={filtered}
            onEdit={(record) => setDialog({ mode: "edit", record })}
            onDelete={setPendingDelete}
            onToggle={toggle}
          />
        )}
      </div>

      {dialog ? (
        <RecordDialog
          key={`${dialog.mode}-${dialog.record?.id ?? "new"}`}
          open
          onOpenChange={(open) => (open ? undefined : setDialog(null))}
          zoneId={zoneId}
          zoneName={zone.name}
          provider={zone.provider}
          record={dialog.record}
        />
      ) : null}

      <DeleteRecordDialog
        record={pendingDelete}
        zoneId={zoneId}
        onOpenChange={(open) => (open ? undefined : setPendingDelete(null))}
      />
    </div>
  );
}

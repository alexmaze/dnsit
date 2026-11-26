import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, GitBranch, Globe, Loader2, MinusCircle, Plus, RefreshCw, Search, ShieldCheck, Table2, X } from "lucide-react";
import { toast } from "sonner";
import { buildZoneTree, knownRecordTypes } from "@dnsit/shared";
import type { HttpsCheckResult, NormalizedRecord } from "@dnsit/shared";
import { api, errorMessage } from "@/api/client";
import { checkDomainHttps, useZoneRecords, useZones } from "@/api/queries";
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
import { runWithConcurrency } from "@/lib/concurrency";
import { domainKey } from "@/lib/domain";
import { relativeTime, PROVIDER_LABEL } from "@/lib/format";

export function ZoneDetail() {
  const { zoneId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "table" ? "table" : "tree";
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [refreshToken, setRefreshToken] = useState(0);
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; record?: NormalizedRecord } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NormalizedRecord | null>(null);
  const [httpsResults, setHttpsResults] = useState<Record<string, HttpsCheckResult>>({});
  const [httpsChecking, setHttpsChecking] = useState(false);
  const [httpsChecked, setHttpsChecked] = useState(0);
  const [httpsTotal, setHttpsTotal] = useState(0);
  const httpsRunRef = useRef(0);

  const zones = useZones();
  const zone = zones.data?.find((item) => item.id === zoneId);
  const recordsQuery = useZoneRecords(zoneId, refreshToken);
  const records = recordsQuery.data?.records ?? [];
  const hasFilters = Boolean(query.trim()) || typeFilter !== "ALL" || statusFilter !== "ALL";

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return records.filter((record) => {
      if (typeFilter !== "ALL" && record.type !== typeFilter) return false;
      if (statusFilter !== "ALL" && record.status !== statusFilter) return false;
      if (!keyword) return true;
      return (
        record.name.toLowerCase().includes(keyword) ||
        record.value.toLowerCase().includes(keyword) ||
        record.fqdn.toLowerCase().includes(keyword) ||
        (record.remark ?? "").toLowerCase().includes(keyword) ||
        (record.host?.hostName.toLowerCase().includes(keyword) ?? false)
      );
    });
  }, [records, query, typeFilter, statusFilter]);

  const httpsSummary = useMemo(() => {
    const domains = new Set(filtered.map((record) => domainKey(record.fqdn)));
    const results = Array.from(domains)
      .map((domain) => httpsResults[domain])
      .filter((result): result is HttpsCheckResult => Boolean(result));
    return {
      domainCount: domains.size,
      ok: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok && result.state !== "INVALID").length,
      invalid: results.filter((result) => result.state === "INVALID").length,
    };
  }, [filtered, httpsResults]);

  const platformZones = useMemo(
    () => (zones.data ?? []).map((item) => ({ name: item.name, zoneId: item.id })),
    [zones.data],
  );

  const tree = useMemo(
    () => buildZoneTree({ zoneName: zone?.name ?? "", records, platformZones }),
    [zone?.name, records, platformZones],
  );
  const visibleRecordIds = useMemo(
    () => (hasFilters ? new Set(filtered.map((record) => record.id)) : undefined),
    [filtered, hasFilters],
  );

  const types = useMemo(() => {
    const set = new Set(records.map((record) => record.type));
    return Array.from(set).sort();
  }, [records]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (event.key === "/" && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && document.activeElement === searchRef.current && query) {
        setQuery("");
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [query]);

  useEffect(() => {
    httpsRunRef.current += 1;
    setHttpsResults({});
    setHttpsChecking(false);
    setHttpsChecked(0);
    setHttpsTotal(0);
  }, [zoneId]);

  useEffect(
    () => () => {
      httpsRunRef.current += 1;
    },
    [],
  );

  function resetFilters() {
    setQuery("");
    setTypeFilter("ALL");
    setStatusFilter("ALL");
    searchRef.current?.focus();
  }

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

  async function testHttps() {
    if (httpsChecking) return;
    const domains = Array.from(new Set(filtered.map((record) => domainKey(record.fqdn))));
    if (domains.length === 0) {
      toast.info("当前页面没有可测试的域名");
      return;
    }

    const runId = httpsRunRef.current + 1;
    httpsRunRef.current = runId;
    setHttpsChecking(true);
    setHttpsChecked(0);
    setHttpsTotal(domains.length);
    let okCount = 0;
    let failedCount = 0;
    let invalidCount = 0;

    try {
      await runWithConcurrency(domains, 6, async (domain) => {
        if (httpsRunRef.current !== runId) return;
        let result: HttpsCheckResult;
        try {
          result = await checkDomainHttps(domain);
        } catch (error) {
          result = {
            domain,
            state: "NETWORK_ERROR",
            ok: false,
            error: errorMessage(error),
            elapsedMs: 0,
            checkedAt: new Date().toISOString(),
          };
        }
        if (httpsRunRef.current !== runId) return;
        if (result.ok) okCount += 1;
        else if (result.state === "INVALID") invalidCount += 1;
        else failedCount += 1;
        setHttpsResults((current) => ({ ...current, [domain]: result }));
        setHttpsChecked((count) => count + 1);
      });

      if (httpsRunRef.current === runId) {
        toast.success(
          `HTTPS 测试完成：${okCount} 个正常，${failedCount} 个异常${
            invalidCount > 0 ? `，${invalidCount} 个无法测试` : ""
          }`,
        );
      }
    } finally {
      if (httpsRunRef.current === runId) setHttpsChecking(false);
    }
  }

  if (!zone && zones.isLoading) {
    return (
      <div className="space-y-4 bg-muted/20 p-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (!zone) {
    return (
      <div className="grid h-full place-items-center bg-muted/20 text-sm text-muted-foreground">
        域名不存在，或已被移除。
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border/70 bg-background">
        <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-500/15 bg-blue-500/8 text-blue-600 dark:text-blue-400">
            <Globe className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{zone.name}</h1>
              <Badge variant="secondary" className="h-5 px-2 text-[10px] font-medium">
                {PROVIDER_LABEL[zone.provider] ?? zone.provider}
              </Badge>
              {zone.status && zone.status !== "ENABLE" ? (
                <Badge variant="destructive" className="h-5 text-[10px]">
                  {zone.status}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {zone.accountName}
              {zone.gradeTitle ? ` · ${zone.gradeTitle}` : ""}
              {zone.vipEndAt ? ` · 套餐到期 ${zone.vipEndAt}` : ""}
              {` · 同步于 ${relativeTime(recordsQuery.data?.syncedAt ?? zone.lastSyncedAt)}`}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="shadow-none"
              onClick={() => setRefreshToken(Date.now())}
              disabled={recordsQuery.isFetching}
            >
              <RefreshCw className={`size-3.5 ${recordsQuery.isFetching ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shadow-none"
              title={`测试当前页面 ${httpsSummary.domainCount} 个域名的 HTTPS 可访问性`}
              onClick={() => void testHttps()}
              disabled={httpsChecking || filtered.length === 0}
            >
              {httpsChecking ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )}
              {httpsChecking ? `测试中 ${httpsChecked}/${httpsTotal}` : "测试 HTTPS"}
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 text-white shadow-sm shadow-blue-600/15 hover:bg-blue-700 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500"
              onClick={() => setDialog({ mode: "create" })}
            >
              <Plus className="size-4" /> 新建记录
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border/50 px-4 py-3 sm:px-6 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索主机记录、记录值或备注"
                aria-label="搜索解析记录"
                className="h-9 bg-muted/25 pr-8 pl-9 text-xs shadow-none focus-visible:bg-background"
              />
              {query ? (
                <button
                  type="button"
                  className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  aria-label="清空搜索"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-border/70 bg-muted px-1.5 py-0.5 font-sans text-[10px] leading-none text-muted-foreground/70">
                  /
                </kbd>
              )}
            </div>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-[116px] bg-muted/25 text-xs shadow-none" aria-label="按记录类型筛选">
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

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[108px] bg-muted/25 text-xs shadow-none" aria-label="按状态筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部状态</SelectItem>
                <SelectItem value="ENABLE">仅看启用</SelectItem>
                <SelectItem value="DISABLE">仅看停用</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters ? (
              <Button variant="ghost" size="sm" className="h-9 px-2 text-xs text-muted-foreground" onClick={resetFilters}>
                <X className="size-3.5" /> 清除筛选
              </Button>
            ) : null}
          </div>

          <Tabs
            value={view}
            onValueChange={(next) => {
              const copy = new URLSearchParams(params);
              copy.set("view", next);
              setParams(copy, { replace: true });
            }}
            className="shrink-0"
          >
            <TabsList className="h-9 border border-border/60 bg-muted/55 p-1">
              <TabsTrigger value="tree" className="h-7 gap-1.5 px-3 text-xs" title="树形视图">
                <GitBranch className="size-3.5" /> 解析链路
              </TabsTrigger>
              <TabsTrigger value="table" className="h-7 gap-1.5 px-3 text-xs" title="表格视图">
                <Table2 className="size-3.5" /> 记录列表
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-muted/20">
        <div className="mx-auto min-w-0 max-w-[1600px] px-4 py-4 sm:px-6 sm:py-5">
          <div className="mb-4 flex min-h-6 flex-wrap items-center gap-2 px-0.5">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {hasFilters ? (
                <>
                  找到 <span className="font-semibold text-foreground">{filtered.length}</span> 条，共 {records.length} 条记录
                </>
              ) : (
                <>
                  共 <span className="font-semibold text-foreground">{records.length}</span> 条解析记录
                </>
              )}
            </p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {httpsSummary.ok > 0 ? (
                <Badge
                  variant="outline"
                  className="h-6 gap-1.5 border-emerald-500/20 bg-emerald-500/5 px-2 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
                >
                  <CircleCheck className="size-3" /> HTTPS 正常 {httpsSummary.ok}
                </Badge>
              ) : null}
              {httpsSummary.failed > 0 ? (
                <Badge
                  variant="outline"
                  className="h-6 gap-1.5 border-destructive/20 bg-destructive/5 px-2 text-[10px] font-medium text-destructive"
                >
                  <CircleAlert className="size-3" /> HTTPS 异常 {httpsSummary.failed}
                </Badge>
              ) : null}
              {httpsSummary.invalid > 0 ? (
                <Badge
                  variant="outline"
                  className="h-6 gap-1.5 border-border/70 bg-muted/40 px-2 text-[10px] font-medium text-muted-foreground"
                >
                  <MinusCircle className="size-3" /> 无法测试 {httpsSummary.invalid}
                </Badge>
              ) : null}
              {tree.stats.dangling > 0 ? (
                <Badge
                  variant="outline"
                  className="h-6 gap-1.5 border-destructive/20 bg-destructive/5 px-2 text-[10px] font-medium text-destructive"
                >
                  <CircleAlert className="size-3" /> {tree.stats.dangling} 个未挂载目标
                </Badge>
              ) : null}
              {tree.stats.cycles > 0 ? (
                <Badge
                  variant="outline"
                  className="h-6 gap-1.5 border-destructive/20 bg-destructive/5 px-2 text-[10px] font-medium text-destructive"
                >
                  <CircleAlert className="size-3" /> {tree.stats.cycles} 处循环引用
                </Badge>
              ) : null}
              {records.some((record) => record.host?.drift === "VALUE_CHANGED") ? (
                <Badge
                  variant="outline"
                  className="h-6 gap-1.5 border-amber-500/20 bg-amber-500/5 px-2 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                >
                  <CircleAlert className="size-3" /> 有记录与主机 IP 不一致
                </Badge>
              ) : null}
            </div>
          </div>

          {recordsQuery.isLoading ? (
            <div className="space-y-1 rounded-xl border bg-card p-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : recordsQuery.isError ? (
            <div className="mx-auto max-w-md rounded-xl border border-destructive/25 bg-card p-5 text-sm shadow-sm">
              <p className="font-semibold text-destructive">加载解析记录失败</p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{errorMessage(recordsQuery.error)}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setRefreshToken(Date.now())}>
                <RefreshCw className="size-3.5" /> 重新加载
              </Button>
            </div>
          ) : records.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center">
              <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Globe className="size-5" />
              </div>
              <p className="mt-4 text-sm font-semibold">这个域名还没有解析记录</p>
              <p className="mt-1.5 text-xs text-muted-foreground">新建第一条记录，开始配置域名解析。</p>
              <Button
                size="sm"
                className="mt-5 bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => setDialog({ mode: "create" })}
              >
                <Plus className="size-3.5" /> 新建记录
              </Button>
            </div>
          ) : view === "tree" ? (
            <CnameTree
              tree={tree}
              visibleRecordIds={visibleRecordIds}
              httpsResults={httpsResults}
              onEdit={(record) => setDialog({ mode: "edit", record })}
              onDelete={setPendingDelete}
              onToggle={toggle}
              onJumpZone={(targetZoneId) => navigate(`/zones/${targetZoneId}`)}
              onResetFilters={hasFilters ? resetFilters : undefined}
            />
          ) : (
            <RecordTable
              records={filtered}
              httpsResults={httpsResults}
              onEdit={(record) => setDialog({ mode: "edit", record })}
              onDelete={setPendingDelete}
              onToggle={toggle}
              onResetFilters={hasFilters ? resetFilters : undefined}
            />
          )}
        </div>
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

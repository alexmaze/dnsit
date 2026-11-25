import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, History, RefreshCw, Search, SearchX, X } from "lucide-react";
import { useAudit, type AuditEntry } from "@/api/queries";
import { errorMessage } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACTION_LABEL, formatTime } from "@/lib/format";

const RESULT: Record<
  string,
  { label: string; variant: "secondary" | "outline" | "destructive"; className?: string }
> = {
  SUCCESS: { label: "成功", variant: "secondary" },
  PARTIAL: {
    label: "部分成功",
    variant: "outline",
    className: "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  },
  FAILED: { label: "失败", variant: "destructive" },
};

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [resultFilter, setResultFilter] = useState("ALL");
  const audit = useAudit(page);
  const items = audit.data?.items ?? [];
  const total = audit.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 50));
  const hasFilters = Boolean(query.trim()) || actionFilter !== "ALL" || resultFilter !== "ALL";

  const actionOptions = useMemo(() => {
    const options = new Map<string, string>(Object.entries(ACTION_LABEL));
    for (const item of items) {
      if (!options.has(item.action)) options.set(item.action, item.action);
    }
    return Array.from(options.entries());
  }, [items]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return items.filter((item) => {
      if (actionFilter !== "ALL" && item.action !== actionFilter) return false;
      if (resultFilter !== "ALL" && item.result !== resultFilter) return false;
      if (!keyword) return true;
      return [
        item.zoneName,
        item.action,
        ACTION_LABEL[item.action] ?? "",
        auditDetail(item) ?? "",
        item.errorCode ?? "",
        item.errorMessage ?? "",
        item.requestId ?? "",
        snapshotSearchText(item.before),
        snapshotSearchText(item.after),
      ].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [items, query, actionFilter, resultFilter]);

  const failedCount = items.filter((item) => item.result === "FAILED").length;
  const partialCount = items.filter((item) => item.result === "PARTIAL").length;
  const rangeStart = items.length > 0 ? (page - 1) * 50 + 1 : 0;
  const rangeEnd = (page - 1) * 50 + items.length;

  function resetFilters() {
    setQuery("");
    setActionFilter("ALL");
    setResultFilter("ALL");
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border/70 bg-background">
        <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/50 text-muted-foreground">
            <History className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">变更记录</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              追踪 DNS 与主机写操作，查看 before / after 快照、执行结果及请求标识。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto shadow-none"
            disabled={audit.isFetching}
            onClick={() => void audit.refetch()}
          >
            <RefreshCw className={`size-3.5 ${audit.isFetching ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-muted/20">
        <div className="mx-auto min-w-0 max-w-[1600px] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索当前页的域名、内容或请求 ID"
                aria-label="搜索当前页变更记录"
                className="h-9 bg-muted/25 pr-9 pl-9 text-xs shadow-none focus-visible:bg-background"
              />
              {query ? (
                <button
                  type="button"
                  className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  aria-label="清空变更记录搜索"
                  onClick={() => setQuery("")}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:items-center">
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger
                  className="h-9 w-full min-w-0 bg-muted/25 text-xs shadow-none sm:w-[148px]"
                  aria-label="按变更动作筛选"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部动作</SelectItem>
                  {actionOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={resultFilter} onValueChange={setResultFilter}>
                <SelectTrigger
                  className="h-9 w-full min-w-0 bg-muted/25 text-xs shadow-none sm:w-32"
                  aria-label="按执行结果筛选"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部结果</SelectItem>
                  <SelectItem value="SUCCESS">成功</SelectItem>
                  <SelectItem value="PARTIAL">部分成功</SelectItem>
                  <SelectItem value="FAILED">失败</SelectItem>
                </SelectContent>
              </Select>
              {hasFilters ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="col-span-2 h-9 px-2 text-xs text-muted-foreground sm:col-span-1"
                  onClick={resetFilters}
                >
                  <X className="size-3.5" /> 清除筛选
                </Button>
              ) : null}
            </div>
          </div>

          <div className="my-3 flex min-h-6 flex-wrap items-center gap-2 px-0.5">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {hasFilters ? (
                <>
                  本页找到 <span className="font-semibold text-foreground">{filtered.length}</span> 条，共 {items.length} 条
                  <span className="ml-1 text-[11px]">（筛选仅作用于当前页）</span>
                </>
              ) : (
                <>
                  共 <span className="font-semibold text-foreground">{audit.data ? total : "—"}</span> 条变更记录
                </>
              )}
            </p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {partialCount > 0 ? (
                <Badge
                  variant="outline"
                  className="h-6 border-amber-500/20 bg-amber-500/5 px-2 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                >
                  本页 {partialCount} 条部分成功
                </Badge>
              ) : null}
              {failedCount > 0 ? (
                <Badge
                  variant="outline"
                  className="h-6 border-destructive/20 bg-destructive/5 px-2 text-[10px] font-medium text-destructive"
                >
                  本页 {failedCount} 条失败
                </Badge>
              ) : null}
            </div>
          </div>

          {audit.isLoading ? (
            <div className="space-y-2 rounded-xl border border-border/70 bg-card p-4" aria-label="正在加载变更记录">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : audit.isError ? (
            <div className="mx-auto max-w-md rounded-xl border border-destructive/25 bg-card p-5 text-sm shadow-sm">
              <p className="font-semibold text-destructive">加载变更记录失败</p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{errorMessage(audit.error)}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                disabled={audit.isFetching}
                onClick={() => void audit.refetch()}
              >
                <RefreshCw className={`size-3.5 ${audit.isFetching ? "animate-spin" : ""}`} /> 重新加载
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center">
              <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                {hasFilters ? <SearchX className="size-5" /> : <History className="size-5" />}
              </div>
              <p className="mt-4 text-sm font-semibold">
                {hasFilters ? "当前页没有匹配的变更记录" : total === 0 && page === 1 ? "还没有变更记录" : "这一页没有变更记录"}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {hasFilters
                  ? "试试其他关键词，或清除动作和结果筛选。"
                  : total === 0 && page === 1
                    ? "解析记录或主机发生写操作后，会在这里留下完整记录。"
                    : "可以返回上一页，或刷新后重新查看。"}
              </p>
              {hasFilters ? (
                <Button variant="outline" size="sm" className="mt-4" onClick={resetFilters}>
                  清除筛选
                </Button>
              ) : page > 1 ? (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  <ChevronLeft className="size-3.5" /> 返回上一页
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]">
              <Table className="min-w-[920px] table-fixed" aria-label="变更记录列表">
                <TableHeader className="bg-muted/45">
                  <TableRow className="border-border/70 hover:bg-transparent">
                    <TableHead className="h-10 w-[168px] px-4 text-[11px] font-medium text-muted-foreground">时间</TableHead>
                    <TableHead className="h-10 w-[130px] px-3 text-[11px] font-medium text-muted-foreground">动作</TableHead>
                    <TableHead className="h-10 w-[170px] px-3 text-[11px] font-medium text-muted-foreground">域名</TableHead>
                    <TableHead className="h-10 px-3 text-[11px] font-medium text-muted-foreground">变更摘要</TableHead>
                    <TableHead className="h-10 w-[96px] px-3 text-[11px] font-medium text-muted-foreground">结果</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => {
                    const result = RESULT[item.result] ?? { label: item.result, variant: "outline" as const };
                    const detail = auditDetail(item);
                    return (
                      <TableRow key={item.id} className="border-border/55 hover:bg-muted/35">
                        <TableCell className="px-4 py-3 font-mono text-[11px] whitespace-normal text-foreground/75">
                          <time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time>
                        </TableCell>
                        <TableCell className="px-3 py-3 text-[13px] font-medium">
                          <span className="block truncate" title={item.action}>
                            {ACTION_LABEL[item.action] ?? item.action}
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-3 text-[13px]">
                          <span className="block truncate" title={item.zoneName}>
                            {item.zoneName || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="min-w-0 px-3 py-3 whitespace-normal">
                          <p
                            className={`line-clamp-2 break-words text-xs leading-5 ${
                              item.errorMessage ? "text-destructive" : "text-muted-foreground"
                            }`}
                            title={detail}
                          >
                            {detail ?? "—"}
                          </p>
                          {item.errorCode || item.requestId ? (
                            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                              {item.errorCode ? (
                                <span className="font-mono text-destructive/80">{item.errorCode}</span>
                              ) : null}
                              {item.requestId ? (
                                <span className="min-w-0 truncate font-mono text-muted-foreground/70" title={item.requestId}>
                                  req {item.requestId}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="px-3 py-3">
                          <Badge
                            variant={result.variant}
                            className={`h-5 gap-1.5 px-2 text-[10px] font-medium ${result.className ?? ""}`}
                          >
                            <span className="size-1.5 rounded-full bg-current opacity-60" />
                            {result.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {!audit.isLoading && !audit.isError && (total > 0 || page > 1) ? (
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">
                第 <span className="font-medium text-foreground">{rangeStart}–{rangeEnd}</span> 条
                <span className="ml-2">每页 50 条</span>
              </p>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[11px] whitespace-nowrap text-muted-foreground">
                  第 {page} / {pageCount} 页
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs shadow-none"
                  disabled={page <= 1 || audit.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="size-3.5" /> 上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs shadow-none"
                  disabled={page >= pageCount || audit.isFetching}
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                >
                  下一页 <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function auditDetail(item: AuditEntry): string | undefined {
  return item.errorMessage ?? describe(item.after) ?? describe(item.before);
}

function snapshotSearchText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "object") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function describe(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const name = typeof record.fqdn === "string" ? record.fqdn : typeof record.name === "string" ? record.name : undefined;
  const type = typeof record.type === "string" ? record.type : undefined;
  const content = typeof record.value === "string" ? record.value : undefined;
  if (name && type && content) return `${name} ${type} → ${content}`;
  if (typeof record.status === "string") return `status → ${record.status}`;
  if (name) return name;
  return undefined;
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CircleAlert, Link2, Pencil, Plus, RefreshCw, Search, Server, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { HostDTO } from "@dnsit/shared";
import { api, errorMessage } from "@/api/client";
import { useHosts } from "@/api/queries";
import { HostFormDialog } from "@/components/HostFormDialog";
import { HostImportDialog } from "@/components/HostImportDialog";
import { HostMatchDialog } from "@/components/HostMatchDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function HostsPage() {
  const hosts = useHosts();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [driftFilter, setDriftFilter] = useState("ALL");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [editing, setEditing] = useState<HostDTO | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const hasFilters = Boolean(query.trim()) || statusFilter !== "ALL" || driftFilter !== "ALL";
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return (hosts.data ?? []).filter((host) => {
      if (statusFilter !== "ALL" && host.status !== statusFilter) return false;
      if (driftFilter === "DRIFT" && !(host.driftCount ?? 0)) return false;
      if (driftFilter === "STABLE" && (host.driftCount ?? 0) > 0) return false;
      if (!keyword) return true;
      return (
        host.name.toLowerCase().includes(keyword) ||
        (host.remark ?? "").toLowerCase().includes(keyword) ||
        host.tags.some((tag) => tag.toLowerCase().includes(keyword)) ||
        host.addresses.some((address) => address.ip.toLowerCase().includes(keyword))
      );
    });
  }, [hosts.data, query, statusFilter, driftFilter]);

  const driftHosts = useMemo(
    () => (hosts.data ?? []).filter((host) => (host.driftCount ?? 0) > 0).length,
    [hosts.data],
  );

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

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function resetFilters() {
    setQuery("");
    setStatusFilter("ALL");
    setDriftFilter("ALL");
    searchRef.current?.focus();
  }

  async function remove(host: HostDTO) {
    setDeletingId(host.id);
    try {
      await api.del(`/hosts/${host.id}?force=1`);
      toast.success(`已删除主机 ${host.name}`);
      await queryClient.invalidateQueries({ queryKey: ["hosts"] });
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border/70 bg-background">
        <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-500/15 bg-blue-500/8 text-blue-600 dark:text-blue-400">
            <Server className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">主机</h1>
            <p className="mt-1 text-xs text-muted-foreground">集中维护主机地址，并将 IP 变更同步到关联解析记录。</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            <Button variant="outline" size="sm" className="shadow-none" onClick={() => setMatchOpen(true)}>
              <Link2 className="size-3.5" /> 按 IP 匹配
            </Button>
            <Button variant="outline" size="sm" className="shadow-none" onClick={() => setImportOpen(true)}>
              <Upload className="size-3.5" /> 批量导入
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 text-white shadow-sm shadow-blue-600/15 hover:bg-blue-700 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500"
              onClick={openCreate}
            >
              <Plus className="size-4" /> 新建主机
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border/50 px-4 py-3 sm:px-6 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="relative w-full min-w-0 sm:max-w-sm sm:flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索主机名、IP、标签或备注"
                aria-label="搜索主机"
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

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[116px] bg-muted/25 text-xs shadow-none" aria-label="按主机状态筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部状态</SelectItem>
                <SelectItem value="ACTIVE">仅看启用</SelectItem>
                <SelectItem value="INACTIVE">仅看停用</SelectItem>
              </SelectContent>
            </Select>

            <Select value={driftFilter} onValueChange={setDriftFilter}>
              <SelectTrigger className="h-9 w-[124px] bg-muted/25 text-xs shadow-none" aria-label="按记录一致性筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部一致性</SelectItem>
                <SelectItem value="DRIFT">仅看漂移</SelectItem>
                <SelectItem value="STABLE">无漂移</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters ? (
              <Button variant="ghost" size="sm" className="h-9 px-2 text-xs text-muted-foreground" onClick={resetFilters}>
                <X className="size-3.5" /> 清除筛选
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-muted/20">
        <div className="mx-auto min-w-0 max-w-[1600px] px-4 py-4 sm:px-6 sm:py-5">
          {!hosts.isLoading && !hosts.isError ? (
            <div className="mb-4 flex min-h-6 flex-wrap items-center gap-2 px-0.5">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {hasFilters ? (
                  <>
                    找到 <span className="font-semibold text-foreground">{filtered.length}</span> 台，共 {hosts.data?.length ?? 0} 台主机
                  </>
                ) : (
                  <>
                    共 <span className="font-semibold text-foreground">{hosts.data?.length ?? 0}</span> 台主机
                  </>
                )}
              </p>
              {driftHosts > 0 ? (
                <p className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  <CircleAlert className="size-3.5" /> {driftHosts} 台主机的关联记录存在漂移
                </p>
              ) : null}
            </div>
          ) : null}

          {hosts.isLoading ? (
            <div className="space-y-1 rounded-xl border bg-card p-4 shadow-sm">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : hosts.isError ? (
            <div className="mx-auto max-w-md rounded-xl border border-destructive/25 bg-card p-5 text-sm shadow-sm">
              <p className="flex items-center gap-2 font-semibold text-destructive">
                <CircleAlert className="size-4" /> 加载主机失败
              </p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{errorMessage(hosts.error)}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => void hosts.refetch()}>
                <RefreshCw className="size-3.5" /> 重新加载
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center shadow-sm">
              <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                {hosts.data?.length ? <Search className="size-5" /> : <Server className="size-5" />}
              </div>
              <p className="mt-4 text-sm font-semibold">{hosts.data?.length ? "没有符合条件的主机" : "还没有录入主机"}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {hosts.data?.length ? "尝试调整关键词或清除筛选条件。" : "新建主机，或批量导入现有主机名与 IP。"}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {hosts.data?.length ? (
                  <Button variant="outline" size="sm" onClick={resetFilters}>
                    <X className="size-3.5" /> 清除筛选
                  </Button>
                ) : (
                  <>
                    <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={openCreate}>
                      <Plus className="size-3.5" /> 录入第一台主机
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                      <Upload className="size-3.5" /> 批量导入
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <Table className="min-w-[1040px]">
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-10 w-[210px] px-4 text-[11px] text-muted-foreground">主机</TableHead>
                    <TableHead className="h-10 min-w-[250px] px-4 text-[11px] text-muted-foreground">IP 地址</TableHead>
                    <TableHead className="h-10 w-[170px] px-4 text-[11px] text-muted-foreground">标签</TableHead>
                    <TableHead className="h-10 w-[110px] px-4 text-[11px] text-muted-foreground">引用记录</TableHead>
                    <TableHead className="h-10 w-[90px] px-4 text-[11px] text-muted-foreground">状态</TableHead>
                    <TableHead className="sticky right-0 z-20 h-10 w-[132px] border-l border-border/60 bg-muted px-4 text-right text-[11px] text-muted-foreground sm:w-[210px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((host) => (
                    <TableRow key={host.id} className="hover:bg-muted/30">
                      <TableCell className="px-4 py-3 align-top">
                        <Link
                          to={`/hosts/${host.id}`}
                          className="inline-flex max-w-full items-center gap-1.5 text-[13px] font-medium hover:text-blue-600 hover:underline"
                        >
                          <span className="truncate">{host.name}</span>
                          <ArrowUpRight className="size-3 shrink-0 text-muted-foreground" />
                        </Link>
                        <p className="mt-1 max-w-44 truncate text-[11px] text-muted-foreground" title={host.remark || "无备注"}>
                          {host.remark || "无备注"}
                        </p>
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top whitespace-normal">
                        <div className="space-y-1.5">
                          {host.addresses.map((address) => (
                            <div key={address.id} className="flex items-center gap-2 text-xs leading-4">
                              <span className="font-mono text-foreground/90">{address.ip}</span>
                              {address.isPrimary ? <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">主地址</span> : null}
                              {address.scope === "PRIVATE" ? <span className="text-[10px] text-muted-foreground">内网</span> : null}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top whitespace-normal">
                        <p className="max-w-40 text-[11px] leading-5 text-muted-foreground" title={host.tags.join("、")}>
                          {host.tags.length ? host.tags.join(" · ") : "—"}
                        </p>
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top">
                        <p className="text-[13px] font-medium tabular-nums">{host.recordCount ?? 0}<span className="ml-1 text-[11px] font-normal text-muted-foreground">条</span></p>
                        {(host.driftCount ?? 0) > 0 ? (
                          <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                            <CircleAlert className="size-3" /> {host.driftCount} 条漂移
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top">
                        <span className={`inline-flex items-center gap-1.5 text-xs ${host.status === "ACTIVE" ? "text-muted-foreground" : "font-medium text-amber-700 dark:text-amber-400"}`}>
                          <span className={`size-1.5 rounded-full ${host.status === "ACTIVE" ? "bg-emerald-500" : "bg-amber-500"}`} />
                          {host.status === "ACTIVE" ? "启用" : "停用"}
                        </span>
                      </TableCell>
                      <TableCell className="sticky right-0 z-[5] border-l border-border/45 bg-card px-4 py-3 align-top">
                        <div className="flex justify-end gap-0.5">
                          <Button asChild variant="ghost" size="sm" className="size-8 px-0 text-xs sm:w-auto sm:px-2">
                            <Link to={`/hosts/${host.id}`} aria-label={`查看 ${host.name} 详情`}>
                              <ArrowUpRight className="size-3.5" /> <span className="hidden sm:inline">详情</span>
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 px-0 text-xs sm:w-auto sm:px-2"
                            aria-label={`编辑 ${host.name}`}
                            onClick={() => {
                              setEditing(host);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="size-3.5" /> <span className="hidden sm:inline">编辑</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 px-0 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive sm:w-auto sm:px-2"
                            disabled={deletingId === host.id}
                            aria-label={`删除 ${host.name}`}
                            onClick={() => void remove(host)}
                          >
                            <Trash2 className="size-3.5" />
                            <span className="hidden sm:inline">{deletingId === host.id ? "删除中…" : "删除"}</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {formOpen ? (
        <HostFormDialog
          key={editing?.id ?? "new"}
          open
          onOpenChange={(open) => (open ? undefined : setFormOpen(false))}
          host={editing}
        />
      ) : null}
      {importOpen ? <HostImportDialog open onOpenChange={() => setImportOpen(false)} /> : null}
      {matchOpen ? <HostMatchDialog open onOpenChange={() => setMatchOpen(false)} /> : null}
    </div>
  );
}

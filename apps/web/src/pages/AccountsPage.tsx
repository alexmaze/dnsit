import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Cloud, Pencil, Plus, RefreshCw, Search, SearchX, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { AccountSummary } from "@dnsit/shared";
import { api, errorMessage } from "@/api/client";
import { useAccounts } from "@/api/queries";
import { AccountDialog } from "@/components/AccountDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTime, PROVIDER_LABEL } from "@/lib/format";

const STATUS: Record<string, { label: string; variant: "secondary" | "destructive" | "outline" }> = {
  ok: { label: "正常", variant: "secondary" },
  invalid: { label: "凭据失效", variant: "destructive" },
  unverified: { label: "未校验", variant: "outline" },
};

export function AccountsPage() {
  const accounts = useAccounts();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AccountSummary | undefined>(undefined);
  const [deleting, setDeleting] = useState<AccountSummary | undefined>(undefined);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  async function verify(account: AccountSummary) {
    setVerifying(account.id);
    try {
      await api.post(`/accounts/${account.id}/verify`);
      toast.success(`「${account.name}」凭据有效`);
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    } finally {
      setVerifying(null);
    }
  }

  async function remove() {
    if (!deleting) return;
    setRemoving(true);
    try {
      const result = await api.del<{ zones: number; records: number }>(`/accounts/${deleting.id}`);
      toast.success(
        `已删除「${deleting.name}」，清掉 ${result.zones} 个域名、${result.records} 条记录缓存（云端未改动）`,
      );
      await queryClient.invalidateQueries();
      setDeleting(undefined);
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setRemoving(false);
    }
  }

  const rows = accounts.data ?? [];
  const hasFilters = Boolean(query.trim()) || statusFilter !== "ALL";
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return rows.filter((account) => {
      if (statusFilter !== "ALL" && account.status !== statusFilter) return false;
      if (!keyword) return true;
      const provider = PROVIDER_LABEL[account.provider] ?? account.provider;
      return [account.name, account.accessKeyMasked, account.provider, provider].some((value) =>
        value.toLowerCase().includes(keyword),
      );
    });
  }, [rows, query, statusFilter]);
  const invalidCount = rows.filter((account) => account.status === "invalid").length;
  const readonlyCount = rows.filter((account) => account.readonly).length;

  function resetFilters() {
    setQuery("");
    setStatusFilter("ALL");
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border/70 bg-background">
        <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/50 text-muted-foreground">
            <Cloud className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">云账号</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              管理 DNS 访问凭据与账号权限。删除账号仅清理本地缓存，不会修改云端解析。
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 max-sm:w-full max-sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              className="shadow-none"
              disabled={accounts.isFetching}
              onClick={() => void accounts.refetch()}
            >
              <RefreshCw className={`size-3.5 ${accounts.isFetching ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 text-white shadow-sm shadow-blue-600/15 hover:bg-blue-700 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" /> 添加云账号
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-muted/20">
        <div className="mx-auto min-w-0 max-w-[1440px] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索备注名、AccessKey 或厂商"
                aria-label="搜索云账号"
                className="h-9 bg-muted/25 pr-9 pl-9 text-xs shadow-none focus-visible:bg-background"
              />
              {query ? (
                <button
                  type="button"
                  className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  aria-label="清空账号搜索"
                  onClick={() => setQuery("")}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-full bg-muted/25 text-xs shadow-none sm:w-32" aria-label="按凭据状态筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部状态</SelectItem>
                <SelectItem value="ok">正常</SelectItem>
                <SelectItem value="invalid">凭据失效</SelectItem>
                <SelectItem value="unverified">未校验</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters ? (
              <Button variant="ghost" size="sm" className="h-9 px-2 text-xs text-muted-foreground" onClick={resetFilters}>
                <X className="size-3.5" /> 清除筛选
              </Button>
            ) : null}
          </div>

          <div className="my-3 flex min-h-6 flex-wrap items-center gap-2 px-0.5">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {hasFilters ? (
                <>
                  找到 <span className="font-semibold text-foreground">{filtered.length}</span> 个，共 {rows.length} 个云账号
                </>
              ) : (
                <>
                  共 <span className="font-semibold text-foreground">{rows.length}</span> 个云账号
                </>
              )}
            </p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {readonlyCount > 0 ? (
                <Badge variant="outline" className="h-6 px-2 text-[10px] font-medium text-muted-foreground">
                  {readonlyCount} 个只读
                </Badge>
              ) : null}
              {invalidCount > 0 ? (
                <Badge
                  variant="outline"
                  className="h-6 border-destructive/20 bg-destructive/5 px-2 text-[10px] font-medium text-destructive"
                >
                  {invalidCount} 个凭据异常
                </Badge>
              ) : null}
            </div>
          </div>

          {accounts.isLoading ? (
            <div className="space-y-2 rounded-xl border border-border/70 bg-card p-4" aria-label="正在加载云账号">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : accounts.isError ? (
            <div className="mx-auto max-w-md rounded-xl border border-destructive/25 bg-card p-5 text-sm shadow-sm">
              <p className="font-semibold text-destructive">加载云账号失败</p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{errorMessage(accounts.error)}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                disabled={accounts.isFetching}
                onClick={() => void accounts.refetch()}
              >
                <RefreshCw className={`size-3.5 ${accounts.isFetching ? "animate-spin" : ""}`} /> 重新加载
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center">
              <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Cloud className="size-5" />
              </div>
              <p className="mt-4 text-sm font-semibold">还没有接入云账号</p>
              <p className="mt-1.5 text-xs text-muted-foreground">添加一组 DNS 访问凭据，开始集中管理云端域名。</p>
              <Button
                size="sm"
                className="mt-5 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="size-3.5" /> 接入第一个账号
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center">
              <SearchX className="mx-auto size-7 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium">没有找到匹配的云账号</p>
              <p className="mt-1.5 text-xs text-muted-foreground">试试其他关键词，或清除凭据状态筛选。</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={resetFilters}>
                清除筛选
              </Button>
            </div>
          ) : (
            <div className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]">
              <Table className="min-w-[1090px] table-fixed" aria-label="云账号列表">
                <TableHeader className="bg-muted/45">
                  <TableRow className="border-border/70 hover:bg-transparent">
                    <TableHead className="h-10 w-[250px] px-4 text-[11px] font-medium text-muted-foreground">账号</TableHead>
                    <TableHead className="h-10 w-[180px] px-3 text-[11px] font-medium text-muted-foreground">
                      AccessKeyId
                    </TableHead>
                    <TableHead className="h-10 w-[210px] px-3 text-[11px] font-medium text-muted-foreground">
                      凭据状态
                    </TableHead>
                    <TableHead className="h-10 w-[70px] px-3 text-right text-[11px] font-medium text-muted-foreground">
                      域名数
                    </TableHead>
                    <TableHead className="h-10 w-[160px] px-3 text-[11px] font-medium text-muted-foreground">
                      最后校验
                    </TableHead>
                    <TableHead className="sticky right-0 z-20 h-10 w-[132px] border-l border-border/60 bg-muted px-3 text-right text-[11px] font-medium text-muted-foreground sm:w-[220px]">
                      操作
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((account) => {
                    const status = STATUS[account.status] ?? STATUS.unverified!;
                    return (
                      <TableRow key={account.id} className="group border-border/55 hover:bg-muted/35">
                        <TableCell className="px-4 py-3 whitespace-normal">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[13px] font-semibold" title={account.name}>
                              {account.name}
                            </span>
                            {account.readonly ? (
                              <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] font-medium text-muted-foreground">
                                只读
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {PROVIDER_LABEL[account.provider] ?? account.provider}
                          </p>
                        </TableCell>
                        <TableCell className="px-3 py-3">
                          <span className="block truncate font-mono text-xs text-foreground/75" title={account.accessKeyMasked}>
                            {account.accessKeyMasked}
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-3 whitespace-normal">
                          <Badge variant={status.variant} className="h-5 gap-1.5 px-2 text-[10px] font-medium">
                            <span className="size-1.5 rounded-full bg-current opacity-60" />
                            {status.label}
                          </Badge>
                          {account.lastError ? (
                            <p
                              className="mt-1.5 line-clamp-2 break-words text-[11px] leading-4 text-destructive"
                              title={account.lastError}
                            >
                              {account.lastError}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right text-[13px] font-medium tabular-nums">
                          {account.zoneCount}
                        </TableCell>
                        <TableCell className="px-3 py-3 text-[11px] whitespace-normal text-muted-foreground">
                          {account.lastVerifiedAt ? formatTime(account.lastVerifiedAt) : "从未校验"}
                        </TableCell>
                        <TableCell className="sticky right-0 z-[5] border-l border-border/45 bg-card px-3 py-3">
                          <div className="flex justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-8 px-0 text-xs sm:w-auto sm:px-2"
                              disabled={verifying === account.id}
                              onClick={() => verify(account)}
                              aria-label={`校验 ${account.name}`}
                            >
                              <RefreshCw className={`size-3.5 ${verifying === account.id ? "animate-spin" : ""}`} />
                              <span className="hidden sm:inline">{verifying === account.id ? "校验中" : "校验"}</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-8 px-0 text-xs sm:w-auto sm:px-2"
                              onClick={() => setEditing(account)}
                              aria-label={`编辑 ${account.name}`}
                            >
                              <Pencil className="size-3.5" /> <span className="hidden sm:inline">编辑</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-8 px-0 text-xs text-destructive hover:text-destructive sm:w-auto sm:px-2"
                              onClick={() => setDeleting(account)}
                              aria-label={`删除 ${account.name}`}
                            >
                              <Trash2 className="size-3.5" /> <span className="hidden sm:inline">删除</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {createOpen ? <AccountDialog open onOpenChange={(open) => (open ? undefined : setCreateOpen(false))} /> : null}
      {editing ? (
        <AccountDialog
          key={editing.id}
          open
          account={editing}
          onOpenChange={(open) => (open ? undefined : setEditing(undefined))}
        />
      ) : null}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => (open ? undefined : setDeleting(undefined))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除账号「{deleting?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              会移除该账号下 {deleting?.zoneCount ?? 0} 个域名的本地缓存与记录缓存，并解除相关的
              主机绑定关系。云上解析不受影响，重新添加账号即可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? "删除中…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

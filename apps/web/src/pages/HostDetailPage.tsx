import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert, Link2, Network, Pencil, Plus, RefreshCw, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { HostAddressDTO, HostDTO } from "@dnsit/shared";
import { api, errorMessage } from "@/api/client";
import { useHost, useHostUsage } from "@/api/queries";
import { HostFormDialog } from "@/components/HostFormDialog";
import { RolloutDialog } from "@/components/RolloutDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";

export function HostDetailPage() {
  const { hostId = "" } = useParams();
  const queryClient = useQueryClient();
  const host = useHost(hostId);
  const usage = useHostUsage(hostId);
  const [editOpen, setEditOpen] = useState(false);
  const [rollout, setRollout] = useState<HostAddressDTO | null>(null);
  const [newIp, setNewIp] = useState("");
  const [addingAddress, setAddingAddress] = useState(false);
  const [removingAddressId, setRemovingAddressId] = useState<string | null>(null);
  const [removingHost, setRemovingHost] = useState(false);

  async function addAddress() {
    if (!newIp.trim()) return;
    setAddingAddress(true);
    try {
      await api.post(`/hosts/${hostId}/addresses`, { ip: newIp.trim(), scope: "PUBLIC" });
      setNewIp("");
      toast.success("地址已添加");
      await queryClient.invalidateQueries({ queryKey: ["host"] });
      await queryClient.invalidateQueries({ queryKey: ["hosts"] });
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setAddingAddress(false);
    }
  }

  async function removeAddress(address: HostAddressDTO) {
    setRemovingAddressId(address.id);
    try {
      await api.del(`/hosts/${hostId}/addresses/${address.id}`);
      toast.success("地址已删除");
      await queryClient.invalidateQueries({ queryKey: ["host"] });
      await queryClient.invalidateQueries({ queryKey: ["hosts"] });
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setRemovingAddressId(null);
    }
  }

  async function removeHost(data: HostDTO) {
    setRemovingHost(true);
    try {
      await api.del(`/hosts/${data.id}?force=1`);
      toast.success("主机已删除");
      await queryClient.invalidateQueries({ queryKey: ["hosts"] });
      window.history.back();
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setRemovingHost(false);
    }
  }

  if (host.isLoading) {
    return (
      <div className="h-full overflow-auto bg-muted/20">
        <div className="border-b bg-background px-4 py-4 sm:px-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-10 w-72" />
        </div>
        <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (host.isError) {
    return (
      <div className="grid h-full place-items-center bg-muted/20 p-4">
        <div className="w-full max-w-md rounded-xl border border-destructive/25 bg-card p-5 text-sm shadow-sm">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <CircleAlert className="size-4" /> 加载主机失败
          </p>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{errorMessage(host.error)}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void host.refetch()}>
              <RefreshCw className="size-3.5" /> 重新加载
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/hosts">返回主机列表</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!host.data) {
    return (
      <div className="grid h-full place-items-center bg-muted/20 p-4">
        <div className="rounded-xl border border-dashed bg-card px-8 py-12 text-center shadow-sm">
          <Server className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">主机不存在，或已被移除。</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/hosts"><ArrowLeft className="size-3.5" /> 返回主机列表</Link>
          </Button>
        </div>
      </div>
    );
  }

  const data = host.data;
  const rows = usage.data ?? [];
  const driftCount = rows.filter((row) => row.drift !== "NONE").length;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border/70 bg-background">
        <div className="px-4 pt-3 sm:px-6">
          <Link to="/hosts" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> 返回主机列表
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-4 pt-3 pb-4 sm:px-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-500/15 bg-blue-500/8 text-blue-600 dark:text-blue-400">
            <Server className="size-5" />
          </div>
          <div className="min-w-0 flex-1 basis-56">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="truncate text-xl font-semibold tracking-tight">{data.name}</h1>
              <span className={`inline-flex items-center gap-1.5 text-[11px] ${data.status === "ACTIVE" ? "text-muted-foreground" : "font-medium text-amber-700 dark:text-amber-400"}`}>
                <span className={`size-1.5 rounded-full ${data.status === "ACTIVE" ? "bg-emerald-500" : "bg-amber-500"}`} />
                {data.status === "ACTIVE" ? "启用" : "停用"}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              {data.remark || "无备注"} · {rows.length} 条关联记录 · 更新于 {relativeTime(data.updatedAt)}
            </p>
            {data.tags.length ? <p className="mt-0.5 text-[11px] text-muted-foreground">标签：{data.tags.join(" · ")}</p> : null}
          </div>
          <div className="flex items-center gap-2 max-sm:w-full">
            <Button variant="outline" size="sm" className="shadow-none" onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5" /> 编辑主机
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/5 hover:text-destructive"
              disabled={removingHost}
              onClick={() => void removeHost(data)}
            >
              <Trash2 className="size-3.5" /> {removingHost ? "删除中…" : "删除"}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-muted/20">
        <div className="mx-auto min-w-0 max-w-6xl space-y-4 px-4 py-4 sm:px-6 sm:py-5">
          <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex flex-col gap-4 border-b border-border/60 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">IP 地址</h2>
                  <span className="text-[11px] text-muted-foreground">{data.addresses.length} 个</span>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">新地址默认为公网，可在配置 A / AAAA 记录时直接引用。</p>
              </div>
              <form
                className="flex w-full items-center gap-2 sm:w-auto"
                onSubmit={(event) => {
                  event.preventDefault();
                  void addAddress();
                }}
              >
                <Input
                  value={newIp}
                  onChange={(event) => setNewIp(event.target.value)}
                  placeholder="输入 IPv4 或 IPv6 地址"
                  aria-label="新增 IP 地址"
                  className="h-9 min-w-0 flex-1 bg-muted/25 font-mono text-xs shadow-none focus-visible:bg-background sm:w-64 sm:flex-none"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-9 shrink-0 bg-blue-600 text-white shadow-sm shadow-blue-600/15 hover:bg-blue-700 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500"
                  disabled={addingAddress || !newIp.trim()}
                >
                  <Plus className="size-3.5" /> {addingAddress ? "添加中…" : "添加地址"}
                </Button>
              </form>
            </div>

            {data.addresses.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Network className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-3 text-[13px] font-medium">还没有 IP 地址</p>
                <p className="mt-1 text-xs text-muted-foreground">在上方输入地址，添加后即可关联解析记录。</p>
              </div>
            ) : (
              <Table className="min-w-[780px]">
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-10 px-5 text-[11px] text-muted-foreground">IP 地址</TableHead>
                    <TableHead className="h-10 w-24 px-4 text-[11px] text-muted-foreground">版本</TableHead>
                    <TableHead className="h-10 w-24 px-4 text-[11px] text-muted-foreground">范围</TableHead>
                    <TableHead className="h-10 w-28 px-4 text-[11px] text-muted-foreground">地址属性</TableHead>
                    <TableHead className="sticky right-0 z-20 h-10 w-40 border-l border-border/60 bg-muted px-5 text-right text-[11px] text-muted-foreground sm:w-56">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.addresses.map((address) => (
                    <TableRow key={address.id} className="hover:bg-muted/30">
                      <TableCell className="px-5 py-3 font-mono text-[13px]">{address.ip}</TableCell>
                      <TableCell className="px-4 py-3 text-xs text-muted-foreground">IPv{address.version}</TableCell>
                      <TableCell className="px-4 py-3 text-xs text-muted-foreground">{address.scope === "PRIVATE" ? "内网" : "公网"}</TableCell>
                      <TableCell className="px-4 py-3">
                        {address.isPrimary ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                            <span className="size-1.5 rounded-full bg-blue-500" /> 主地址
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="sticky right-0 z-[5] border-l border-border/45 bg-card px-5 py-3">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="outline" size="sm" className="h-8 px-2 text-xs shadow-none" onClick={() => setRollout(address)} aria-label={`修改 ${address.ip} 并同步记录`}>
                            <RefreshCw className="size-3.5" />
                            <span className="sm:hidden">同步</span>
                            <span className="hidden sm:inline">改 IP 并同步</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 px-0 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive sm:w-auto sm:px-2"
                            disabled={removingAddressId === address.id}
                            aria-label={`删除地址 ${address.ip}`}
                            onClick={() => void removeAddress(address)}
                          >
                            <Trash2 className="size-3.5" />
                            <span className="hidden sm:inline">{removingAddressId === address.id ? "删除中…" : "删除"}</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-4 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold">关联解析记录</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">使用当前主机地址的 A / AAAA 记录及其同步状态。</p>
              </div>
              <div className="ml-auto flex items-center gap-3 text-[11px]">
                <span className="text-muted-foreground">{rows.length} 条记录</span>
                {driftCount > 0 ? (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                    <CircleAlert className="size-3.5" /> {driftCount} 条需处理
                  </span>
                ) : null}
              </div>
            </div>

            {usage.isLoading ? (
              <div className="space-y-1 p-4 sm:p-5">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : usage.isError ? (
              <div className="px-4 py-10 text-center sm:px-5">
                <CircleAlert className="mx-auto size-5 text-destructive" />
                <p className="mt-3 text-[13px] font-semibold text-destructive">加载关联记录失败</p>
                <p className="mx-auto mt-1.5 max-w-lg text-xs leading-5 text-muted-foreground">{errorMessage(usage.error)}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => void usage.refetch()}>
                  <RefreshCw className="size-3.5" /> 重新加载
                </Button>
              </div>
            ) : rows.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Link2 className="size-4" />
                </div>
                <p className="mt-3 text-[13px] font-medium">还没有关联解析记录</p>
                <p className="mt-1 text-xs text-muted-foreground">在域名记录中选择此主机，或返回列表使用“按 IP 匹配”。</p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link to="/hosts"><Link2 className="size-3.5" /> 返回列表匹配记录</Link>
                </Button>
              </div>
            ) : (
              <Table className="min-w-[940px]">
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-10 w-[210px] px-5 text-[11px] text-muted-foreground">域名</TableHead>
                    <TableHead className="h-10 w-[150px] px-4 text-[11px] text-muted-foreground">主机记录</TableHead>
                    <TableHead className="h-10 w-20 px-4 text-[11px] text-muted-foreground">类型</TableHead>
                    <TableHead className="h-10 min-w-[190px] px-4 text-[11px] text-muted-foreground">记录值</TableHead>
                    <TableHead className="h-10 w-24 px-4 text-[11px] text-muted-foreground">状态</TableHead>
                    <TableHead className="h-10 w-32 px-5 text-[11px] text-muted-foreground">一致性</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={`${row.zoneId}-${row.recordId}`} className="hover:bg-muted/30">
                      <TableCell className="px-5 py-3">
                        <Link to={`/zones/${row.zoneId}`} className="text-[13px] font-medium hover:text-blue-600 hover:underline">
                          {row.zoneName}
                        </Link>
                        <p className="mt-1 text-[11px] text-muted-foreground">{row.accountName}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 font-mono text-xs" title={row.fqdn}>{row.name === "@" ? "@" : row.name}</TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant="outline" className="h-5 rounded-md px-1.5 font-mono text-[10px] font-medium">{row.type}</Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 font-mono text-xs break-all whitespace-normal">{row.value}</TableCell>
                      <TableCell className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs ${row.status === "ENABLE" ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400"}`}>
                          <span className={`size-1.5 rounded-full ${row.status === "ENABLE" ? "bg-emerald-500" : "bg-amber-500"}`} />
                          {row.status === "ENABLE" ? "启用" : "停用"}
                        </span>
                      </TableCell>
                      <TableCell className="px-5 py-3">
                        {row.drift === "NONE" ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="size-1.5 rounded-full bg-emerald-500" /> 一致
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                            <CircleAlert className="size-3.5" /> {row.drift === "RECORD_GONE" ? "记录已删除" : "值不一致"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      </div>

      {editOpen ? <HostFormDialog open host={data} onOpenChange={() => setEditOpen(false)} /> : null}
      {rollout ? (
        <RolloutDialog
          open
          hostId={hostId}
          address={rollout}
          onOpenChange={(open) => (open ? undefined : setRollout(null))}
        />
      ) : null}
    </div>
  );
}

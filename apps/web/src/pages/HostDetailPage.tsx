import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { HostAddressDTO, HostDTO } from "@dnsit/shared";
import { api, errorMessage } from "@/api/client";
import { useHost, useHostUsage } from "@/api/queries";
import { HostFormDialog } from "@/components/HostFormDialog";
import { RolloutDialog } from "@/components/RolloutDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  async function addAddress() {
    if (!newIp.trim()) return;
    try {
      await api.post(`/hosts/${hostId}/addresses`, { ip: newIp.trim(), scope: "PUBLIC" });
      setNewIp("");
      toast.success("地址已添加");
      await queryClient.invalidateQueries({ queryKey: ["host"] });
      await queryClient.invalidateQueries({ queryKey: ["hosts"] });
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    }
  }

  async function removeAddress(address: HostAddressDTO) {
    try {
      await api.del(`/hosts/${hostId}/addresses/${address.id}`);
      toast.success("地址已删除");
      await queryClient.invalidateQueries({ queryKey: ["host"] });
      await queryClient.invalidateQueries({ queryKey: ["hosts"] });
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    }
  }

  async function removeHost(data: HostDTO) {
    try {
      await api.del(`/hosts/${data.id}?force=1`);
      toast.success("主机已删除");
      await queryClient.invalidateQueries({ queryKey: ["hosts"] });
      window.history.back();
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    }
  }

  if (host.isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!host.data) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground">主机不存在</div>;
  }

  const data = host.data;
  const rows = usage.data ?? [];

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Link to="/hosts" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> 返回主机列表
        </Link>

        <header className="flex flex-wrap items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{data.name}</h1>
              {data.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
              {data.status === "INACTIVE" ? (
                <Badge variant="outline" className="text-[10px] text-amber-500">
                  停用
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {data.remark || "无备注"} · 被 {rows.length} 条记录引用 · 更新于 {relativeTime(data.updatedAt)}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => removeHost(data)}
            >
              <Trash2 className="size-3.5" /> 删除
            </Button>
          </div>
        </header>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">IP 地址</CardTitle>
            <div className="flex items-center gap-2">
              <Input
                value={newIp}
                onChange={(event) => setNewIp(event.target.value)}
                placeholder="新增 IP"
                className="h-8 w-40 font-mono text-xs"
              />
              <Button size="sm" variant="outline" className="h-8" onClick={addAddress}>
                <Plus className="size-3.5" /> 添加
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP</TableHead>
                  <TableHead className="w-24">版本</TableHead>
                  <TableHead className="w-24">范围</TableHead>
                  <TableHead className="w-20">主地址</TableHead>
                  <TableHead className="w-48" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.addresses.map((address) => (
                  <TableRow key={address.id}>
                    <TableCell className="font-mono text-xs">{address.ip}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">IPv{address.version}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {address.scope === "PRIVATE" ? "内网" : "公网"}
                    </TableCell>
                    <TableCell>{address.isPrimary ? <Badge variant="secondary" className="text-[10px]">主</Badge> : null}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setRollout(address)}
                        >
                          <RefreshCw className="size-3" /> 改 IP 并同步
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => removeAddress(address)}
                        >
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">被引用的解析记录</CardTitle>
          </CardHeader>
          <CardContent>
            {usage.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                这台机器的 IP 还没有被任何解析记录使用
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>域名</TableHead>
                    <TableHead>主机记录</TableHead>
                    <TableHead className="w-20">类型</TableHead>
                    <TableHead>值</TableHead>
                    <TableHead className="w-24">状态</TableHead>
                    <TableHead className="w-24">一致性</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={`${row.zoneId}-${row.recordId}`}>
                      <TableCell>
                        <Link to={`/zones/${row.zoneId}`} className="text-xs hover:underline">
                          {row.zoneName}
                        </Link>
                        <p className="text-[10px] text-muted-foreground">{row.accountName}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.name === "@" ? "@" : row.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">{row.type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.value}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.status === "ENABLE" ? "启用" : "停用"}
                      </TableCell>
                      <TableCell>
                        {row.drift === "NONE" ? (
                          <Badge variant="secondary" className="text-[10px]">一致</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-500">
                            {row.drift === "RECORD_GONE" ? "记录已删除" : "值不一致"}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
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

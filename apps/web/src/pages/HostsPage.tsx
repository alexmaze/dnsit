import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Link2, Plus, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import type { HostDTO } from "@dnsit/shared";
import { api, errorMessage } from "@/api/client";
import { useHosts } from "@/api/queries";
import { HostFormDialog } from "@/components/HostFormDialog";
import { HostImportDialog } from "@/components/HostImportDialog";
import { HostMatchDialog } from "@/components/HostMatchDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function HostsPage() {
  const hosts = useHosts();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [editing, setEditing] = useState<HostDTO | undefined>(undefined);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const list = hosts.data ?? [];
    if (!keyword) return list;
    return list.filter(
      (host) =>
        host.name.toLowerCase().includes(keyword) ||
        (host.remark ?? "").toLowerCase().includes(keyword) ||
        host.tags.some((tag) => tag.toLowerCase().includes(keyword)) ||
        host.addresses.some((address) => address.ip.includes(keyword)),
    );
  }, [hosts.data, query]);

  async function remove(host: HostDTO) {
    try {
      await api.del(`/hosts/${host.id}?force=1`);
      toast.success(`已删除主机 ${host.name}`);
      await queryClient.invalidateQueries({ queryKey: ["hosts"] });
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <header className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold">主机</h1>
            <p className="text-sm text-muted-foreground">
              录入机器的主机名与 IP，配置 A/AAAA 记录时可直接选择，改 IP 可一键同步到所有引用记录。
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索主机名 / IP / 标签"
                className="h-8 w-56 pl-7 text-xs"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setMatchOpen(true)}>
              <Link2 className="size-3.5" /> 按 IP 匹配
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="size-3.5" /> 批量导入
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              <Plus className="size-3.5" /> 新建主机
            </Button>
          </div>
        </header>

        {hosts.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {hosts.data?.length ? "没有匹配的主机" : "还没有录入任何主机"}
            </p>
            {!hosts.data?.length ? (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setFormOpen(true)}>
                录入第一台主机
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">主机名</TableHead>
                  <TableHead>地址</TableHead>
                  <TableHead className="w-40">标签</TableHead>
                  <TableHead className="w-24 text-right">引用</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((host) => (
                  <TableRow key={host.id}>
                    <TableCell>
                      <Link to={`/hosts/${host.id}`} className="font-medium hover:underline">
                        {host.name}
                      </Link>
                      {host.remark ? (
                        <p className="max-w-40 truncate text-[11px] text-muted-foreground">{host.remark}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {host.addresses.map((address) => (
                          <Badge
                            key={address.id}
                            variant={address.isPrimary ? "secondary" : "outline"}
                            className="font-mono text-[10px]"
                          >
                            {address.ip}
                            {address.scope === "PRIVATE" ? " · 内网" : ""}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {host.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {host.recordCount ?? 0}
                      {(host.driftCount ?? 0) > 0 ? (
                        <span className="ml-1 text-amber-500">({host.driftCount} 漂移)</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <span className={host.status === "ACTIVE" ? "text-xs text-muted-foreground" : "text-xs text-amber-500"}>
                        {host.status === "ACTIVE" ? "启用" : "停用"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setEditing(host);
                            setFormOpen(true);
                          }}
                        >
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => remove(host)}
                        >
                          删除
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
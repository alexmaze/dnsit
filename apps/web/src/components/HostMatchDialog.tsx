import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface MatchSuggestion {
  zoneId: string;
  zoneName: string;
  remoteId: string;
  name: string;
  fqdn: string;
  type: string;
  value: string;
  addressId: string;
  hostId: string;
  hostName: string;
  hostStatus: string;
}

interface AmbiguousCandidate {
  zoneId: string;
  zoneName: string;
  remoteId: string;
  fqdn: string;
  value: string;
  hosts: string[];
}

interface Suggestions {
  matches: MatchSuggestion[];
  ambiguous: AmbiguousCandidate[];
  alreadyBound: number;
  unmatched: number;
  hostsWithoutRecords: string[];
}

interface BindResult {
  bound: Array<{ fqdn: string; hostName: string; ip: string }>;
  skipped: Array<{ zoneId: string; remoteId: string; reason: string }>;
}

const keyOf = (item: { zoneId: string; remoteId: string }) => `${item.zoneId}:${item.remoteId}`;

export function HostMatchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [data, setData] = useState<Suggestions | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<Suggestions>("/host-links/suggestions");
      setData(result);
      setSelected(new Set(result.matches.map(keyOf)));
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const selectedItems = useMemo(
    () => (data?.matches ?? []).filter((item) => selected.has(keyOf(item))),
    [data, selected],
  );

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submit() {
    if (selectedItems.length === 0) return;
    setBusy(true);
    try {
      const result = await api.post<BindResult>("/host-links/bind", {
        items: selectedItems.map((item) => ({
          zoneId: item.zoneId,
          remoteId: item.remoteId,
          addressId: item.addressId,
        })),
      });
      if (result.skipped.length === 0) {
        toast.success(`已绑定 ${result.bound.length} 条记录`);
      } else {
        toast.warning(`绑定 ${result.bound.length} 条，跳过 ${result.skipped.length} 条`);
      }
      await queryClient.invalidateQueries({ queryKey: ["hosts"] });
      await queryClient.invalidateQueries({ queryKey: ["host"] });
      await queryClient.invalidateQueries({ queryKey: ["zone"] });
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setBusy(false);
    }
  }

  const matches = data?.matches ?? [];
  const allChecked = matches.length > 0 && selected.size === matches.length;

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>按 IP 匹配现有记录</DialogTitle>
          <DialogDescription>
            扫描所有 A / AAAA 记录，把值恰好等于主机 IP 的记录列出来。只做建议，勾选后才会写入绑定。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !data ? (
          <p className="py-8 text-center text-sm text-muted-foreground">读取失败</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{matches.length} 条可绑定</Badge>
              {data.ambiguous.length > 0 ? (
                <Badge variant="outline" className="text-amber-500">
                  {data.ambiguous.length} 条 IP 冲突
                </Badge>
              ) : null}
              <span>已绑定 {data.alreadyBound} 条</span>
              <span>·</span>
              <span>{data.unmatched} 条记录未匹配到主机</span>
              {data.hostsWithoutRecords.length > 0 ? (
                <span>· 无记录的主机：{data.hostsWithoutRecords.join("、")}</span>
              ) : null}
            </div>

            {matches.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
                没有可绑定的记录。确认主机 IP 与记录值完全一致后刷新再看看。
              </div>
            ) : (
              <div className="max-h-80 overflow-auto rounded-md border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allChecked}
                          onCheckedChange={(value) =>
                            setSelected(value ? new Set(matches.map(keyOf)) : new Set())
                          }
                        />
                      </TableHead>
                      <TableHead>记录</TableHead>
                      <TableHead className="w-24">类型</TableHead>
                      <TableHead className="w-40">IP</TableHead>
                      <TableHead className="w-32">主机</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matches.map((item) => {
                      const key = keyOf(item);
                      return (
                        <TableRow key={key}>
                          <TableCell>
                            <Checkbox checked={selected.has(key)} onCheckedChange={() => toggle(key)} />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{item.fqdn}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {item.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{item.value}</TableCell>
                          <TableCell className="text-xs">
                            <span className="inline-flex items-center gap-1">
                              <Link2 className="size-3 text-muted-foreground" />
                              {item.hostName}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {data.ambiguous.length > 0 ? (
              <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-500">
                  <ShieldAlert className="size-3.5" /> 同一个 IP 属于多台主机，需要你手动确认
                </p>
                {data.ambiguous.map((item) => (
                  <p key={keyOf(item)} className="text-[11px] text-muted-foreground">
                    <span className="font-mono">{item.fqdn}</span> → {item.value}（{item.hosts.join(" / ")}）
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            关闭
          </Button>
          <Button onClick={submit} disabled={busy || selectedItems.length === 0}>
            {busy ? "绑定中…" : `绑定选中的 ${selectedItems.length} 条`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

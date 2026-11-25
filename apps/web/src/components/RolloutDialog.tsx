import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { HostAddressDTO, NormalizedRecord } from "@dnsit/shared";
import { api, errorMessage } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PlanItem {
  zoneId: string;
  zoneName: string;
  remoteId: string;
  record: NormalizedRecord;
  before: string;
  after: string;
}

interface PlanResponse {
  addressId: string;
  currentIp: string;
  newIp: string;
  affected: PlanItem[];
  skipped: Array<{ zoneName: string; fqdn?: string; reason: string }>;
}

interface ApplyResponse {
  succeeded: PlanItem[];
  failed: Array<{ item: PlanItem; message: string }>;
}

export function RolloutDialog({
  open,
  onOpenChange,
  hostId,
  address,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostId: string;
  address: HostAddressDTO;
}) {
  const queryClient = useQueryClient();
  const [newIp, setNewIp] = useState("");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [result, setResult] = useState<ApplyResponse | null>(null);
  const [busy, setBusy] = useState(false);

  async function preview() {
    setBusy(true);
    setResult(null);
    try {
      setPlan(await api.post<PlanResponse>(`/hosts/${hostId}/addresses/${address.id}/plan`, { newIp }));
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!plan) return;
    setBusy(true);
    try {
      const response = await api.post<ApplyResponse>(`/hosts/${hostId}/addresses/${address.id}/apply`, {
        newIp: plan.newIp,
        expectedCount: plan.affected.length,
      });
      setResult(response);
      if (response.failed.length === 0) toast.success(`已更新 ${response.succeeded.length} 条记录`);
      else toast.warning(`成功 ${response.succeeded.length} 条，失败 ${response.failed.length} 条`);
      await queryClient.invalidateQueries({ queryKey: ["hosts"] });
      await queryClient.invalidateQueries({ queryKey: ["host"] });
      await queryClient.invalidateQueries({ queryKey: ["zone"] });
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>改 IP 并同步更新记录</DialogTitle>
          <DialogDescription>
            当前 IP <span className="font-mono">{address.ip}</span>。先预览受影响的解析记录，确认后逐条更新（非原子）。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label>新 IP</Label>
              <Input
                value={newIp}
                onChange={(event) => {
                  setNewIp(event.target.value);
                  setPlan(null);
                  setResult(null);
                }}
                className="font-mono"
                placeholder="例如 1.2.3.5"
              />
            </div>
            <Button variant="outline" onClick={preview} disabled={busy || !newIp.trim()}>
              预览影响
            </Button>
          </div>

          {plan ? (
            <div className="space-y-2 rounded-md border border-border/60 p-3">
              <p className="text-sm">
                将更新 <span className="font-semibold">{plan.affected.length}</span> 条记录
                {plan.skipped.length > 0 ? `，跳过 ${plan.skipped.length} 条` : ""}
              </p>
              <div className="max-h-56 space-y-1 overflow-auto">
                {plan.affected.map((item) => (
                  <div key={`${item.zoneId}-${item.remoteId}`} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="h-4 px-1 font-mono text-[10px]">{item.record.type}</Badge>
                    <span className="font-mono">{item.record.fqdn}</span>
                    <span className="text-muted-foreground">{item.before} → {item.after}</span>
                  </div>
                ))}
                {plan.skipped.map((item, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs text-amber-500">
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">跳过</Badge>
                    <span className="font-mono">{item.fqdn ?? item.zoneName}</span>
                    <span>
                      {item.reason === "DRIFTED"
                        ? "记录值已被手动改动"
                        : item.reason === "RECORD_GONE"
                          ? "记录已不存在"
                          : "不是 A/AAAA 记录"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {result ? (
            <div className="space-y-2 rounded-md border border-border/60 p-3">
              <p className="text-sm">
                成功 {result.succeeded.length} 条，失败 {result.failed.length} 条
              </p>
              {result.failed.map((item) => (
                <p key={`${item.item.zoneId}-${item.item.remoteId}`} className="text-xs text-destructive">
                  {item.item.record.fqdn}: {item.message}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            关闭
          </Button>
          <Button onClick={apply} disabled={busy || !plan || plan.affected.length === 0 || Boolean(result)}>
            {busy ? "执行中…" : `执行更新（${plan?.affected.length ?? 0} 条）`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

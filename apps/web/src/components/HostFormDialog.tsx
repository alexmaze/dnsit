import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { HostDTO } from "@dnsit/shared";
import { api, errorMessage } from "@/api/client";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export function HostFormDialog({
  open,
  onOpenChange,
  host,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  host?: HostDTO;
}) {
  const queryClient = useQueryClient();
  const editing = Boolean(host);
  const [name, setName] = useState(host?.name ?? "");
  const [remark, setRemark] = useState(host?.remark ?? "");
  const [tags, setTags] = useState((host?.tags ?? []).join(", "));
  const [ips, setIps] = useState("");
  const [active, setActive] = useState((host?.status ?? "ACTIVE") === "ACTIVE");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) {
      toast.error("主机名必填");
      return;
    }
    const tagList = tags
      .split(/[,，\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      if (editing && host) {
        await api.patch(`/hosts/${host.id}`, {
          name: name.trim(),
          remark: remark.trim() || null,
          tags: tagList,
          status: active ? "ACTIVE" : "INACTIVE",
        });
        toast.success("主机已更新");
      } else {
        const addresses = ips
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((ip, index) => ({ ip, scope: "PUBLIC" as const, isPrimary: index === 0 }));
        if (addresses.length === 0) {
          toast.error("至少填写一个 IP");
          setSaving(false);
          return;
        }
        await api.post("/hosts", {
          name: name.trim(),
          remark: remark.trim() || undefined,
          tags: tagList,
          status: active ? "ACTIVE" : "INACTIVE",
          addresses,
        });
        toast.success("主机已创建");
      }
      await queryClient.invalidateQueries({ queryKey: ["hosts"] });
      await queryClient.invalidateQueries({ queryKey: ["host"] });
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑主机" : "新建主机"}</DialogTitle>
          <DialogDescription>
            {editing ? "地址请在该主机详情页维护；改 IP 会走预览与逐条同步。" : "一台主机可以有多个 IP，第一行为主地址。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>主机名</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 web-01 / hk-node" />
          </div>

          {!editing ? (
            <div className="space-y-1.5">
              <Label>IP 地址</Label>
              <Textarea
                value={ips}
                onChange={(event) => setIps(event.target.value)}
                rows={4}
                className="font-mono text-xs"
                placeholder={"1.2.3.4\n10.0.0.5"}
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>标签</Label>
            <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="prod, hk, 主站" />
          </div>

          <div className="space-y-1.5">
            <Label>备注</Label>
            <Input value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="机房、用途、负责人" />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <div>
              <p className="text-sm">启用</p>
              <p className="text-xs text-muted-foreground">停用只影响选择时的提示，不会改动云端记录</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

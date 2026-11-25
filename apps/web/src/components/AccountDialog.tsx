import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function AccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<"aliyun" | "tencent">("aliyun");
  const [name, setName] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [accessKeySecret, setAccessKeySecret] = useState("");
  const [readonly, setReadonly] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setAccessKeyId("");
    setAccessKeySecret("");
    setReadonly(false);
  }

  async function submit() {
    if (!name.trim() || !accessKeyId.trim() || !accessKeySecret.trim()) {
      toast.error("请填写备注名、AccessKeyId 和 AccessKeySecret");
      return;
    }
    setSaving(true);
    try {
      await api.post("/accounts", {
        provider,
        name: name.trim(),
        accessKeyId: accessKeyId.trim(),
        accessKeySecret: accessKeySecret.trim(),
        readonly,
      });
      toast.success("账号已接入，正在同步域名");
      await queryClient.invalidateQueries();
      reset();
      onOpenChange(false);
      await api.post("/zones/sync").catch(() => undefined);
      await queryClient.invalidateQueries();
    } catch (error) {
      toast.error(errorMessage(error), { duration: 8000 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>添加云账号</DialogTitle>
          <DialogDescription>
            建议使用只授予 DNS 权限的子账号。密钥会以 AES-256-GCM 加密后保存在本地数据库。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>云厂商</Label>
            <Select value={provider} onValueChange={(value) => setProvider(value as "aliyun" | "tencent")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aliyun">阿里云（云解析 DNS）</SelectItem>
                <SelectItem value="tencent">腾讯云（DNSPod）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>备注名</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：阿里-主账号" />
          </div>

          <div className="space-y-1.5">
            <Label>AccessKeyId</Label>
            <Input value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} placeholder="LTAI... / AKID..." />
          </div>

          <div className="space-y-1.5">
            <Label>AccessKeySecret</Label>
            <Input
              type="password"
              value={accessKeySecret}
              onChange={(e) => setAccessKeySecret(e.target.value)}
              placeholder="只保存加密后的密文"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <div>
              <p className="text-sm">只读账号</p>
              <p className="text-xs text-muted-foreground">开启后该账号下所有写操作都会被拒绝</p>
            </div>
            <Switch checked={readonly} onCheckedChange={setReadonly} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "校验中…" : "校验并保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

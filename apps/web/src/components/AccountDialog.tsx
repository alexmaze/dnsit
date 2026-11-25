import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AccountSummary } from "@dnsit/shared";
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
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: AccountSummary;
}) {
  const queryClient = useQueryClient();
  const editing = Boolean(account);
  const [provider, setProvider] = useState<"aliyun" | "tencent">(account?.provider ?? "aliyun");
  const [name, setName] = useState(account?.name ?? "");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [accessKeySecret, setAccessKeySecret] = useState("");
  const [readonly, setReadonly] = useState(account?.readonly ?? false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) {
      toast.error("备注名必填");
      return;
    }
    if (!editing && (!accessKeyId.trim() || !accessKeySecret.trim())) {
      toast.error("请填写 AccessKeyId 和 AccessKeySecret");
      return;
    }
    setSaving(true);
    try {
      if (editing && account) {
        await api.patch(`/accounts/${account.id}`, {
          name: name.trim(),
          readonly,
          ...(accessKeyId.trim() ? { accessKeyId: accessKeyId.trim() } : {}),
          ...(accessKeySecret.trim() ? { accessKeySecret: accessKeySecret.trim() } : {}),
        });
        toast.success("账号已更新");
      } else {
        await api.post("/accounts", {
          provider,
          name: name.trim(),
          accessKeyId: accessKeyId.trim(),
          accessKeySecret: accessKeySecret.trim(),
          readonly,
        });
        toast.success("账号已接入，正在同步域名");
      }
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["zones"] });
      if (!editing) {
        await api.post("/zones/sync").catch(() => undefined);
        await queryClient.invalidateQueries();
      }
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
          <DialogTitle>{editing ? `编辑账号 · ${account?.name}` : "添加云账号"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "改密钥会先用新凭据跑一次真实调用校验，通过后才写入。AK/Secret 两项都留空表示不修改。"
              : "建议使用只授予 DNS 权限的子账号。密钥会以 AES-256-GCM 加密后保存在本地数据库。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>云厂商</Label>
            <Select
              value={provider}
              onValueChange={(value) => setProvider(value as "aliyun" | "tencent")}
              disabled={editing}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aliyun">阿里云（云解析 DNS）</SelectItem>
                <SelectItem value="tencent">腾讯云（DNSPod）</SelectItem>
              </SelectContent>
            </Select>
            {editing ? (
              <p className="text-xs text-muted-foreground">
                已接入的厂商不能改；要换厂商请删除后重新添加
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>备注名</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：阿里-主账号" />
          </div>

          <div className="space-y-1.5">
            <Label>AccessKeyId</Label>
            <Input
              value={accessKeyId}
              onChange={(event) => setAccessKeyId(event.target.value)}
              placeholder={editing ? `当前 ${account?.accessKeyMasked}，留空不修改` : "LTAI... / AKID..."}
            />
          </div>

          <div className="space-y-1.5">
            <Label>AccessKeySecret</Label>
            <Input
              type="password"
              value={accessKeySecret}
              onChange={(event) => setAccessKeySecret(event.target.value)}
              placeholder={editing ? "留空不修改" : "只保存加密后的密文"}
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
            {saving ? (editing ? "保存中…" : "校验中…") : editing ? "保存修改" : "校验并保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

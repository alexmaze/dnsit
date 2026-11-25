import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { diffRecord, knownRecordTypes, TTL_PRESETS } from "@dnsit/shared";
import type { NormalizedRecord, ProviderKind } from "@dnsit/shared";
import { api, errorMessage } from "@/api/client";
import { useZoneLines } from "@/api/queries";
import { HostPicker } from "@/components/HostPicker";
import type { BoundAddress } from "@/components/HostPicker";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const ADDRESS_TYPES = ["A", "AAAA"];
const DEFAULT_LINE: Record<ProviderKind, string> = { aliyun: "default", tencent: "默认" };

export function RecordDialog({
  open,
  onOpenChange,
  zoneId,
  zoneName,
  provider,
  record,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zoneId: string;
  zoneName: string;
  provider: ProviderKind;
  record?: NormalizedRecord;
}) {
  const queryClient = useQueryClient();
  const lines = useZoneLines(zoneId);
  const editing = Boolean(record);

  const [type, setType] = useState(record?.type ?? "A");
  const [name, setName] = useState(record?.name ?? "");
  const [value, setValue] = useState(record?.value ?? "");
  const [ttl, setTtl] = useState(String(record?.ttl ?? 600));
  const [line, setLine] = useState(record?.line.code ?? DEFAULT_LINE[provider]);
  const [priority, setPriority] = useState(String(record?.priority ?? 10));
  const [remark, setRemark] = useState(record?.remark ?? "");
  const [enabled, setEnabled] = useState((record?.status ?? "ENABLE") === "ENABLE");
  const [bound, setBound] = useState<BoundAddress | null>(
    record?.host
      ? {
          addressId: record.host.addressId,
          hostId: record.host.hostId,
          hostName: record.host.hostName,
          ip: record.host.ip,
        }
      : null,
  );
  const [saving, setSaving] = useState(false);

  const isAddress = ADDRESS_TYPES.includes(type);
  const fqdn = name.trim() === "" || name.trim() === "@" ? zoneName : `${name.trim()}.${zoneName}`;

  const lineOptions = useMemo(() => {
    const fetched = lines.data ?? [];
    if (fetched.length > 0) return fetched;
    return provider === "aliyun"
      ? [{ code: "default", label: "默认" }]
      : [{ code: "默认", label: "默认" }];
  }, [lines.data, provider]);

  const changes = useMemo(() => {
    if (!editing || !record) return [];
    return diffRecord(record, {
      name,
      type,
      value,
      ttl: Number(ttl),
      line,
      priority: type === "MX" ? Number(priority) : undefined,
      remark: remark || undefined,
      status: enabled ? "ENABLE" : "DISABLE",
      hostName: bound?.hostName ?? (record.host ? null : undefined),
    });
  }, [editing, record, name, type, value, ttl, line, priority, remark, enabled, bound]);

  async function submit() {
    if (!name.trim() && name !== "@") {
      toast.error("请填写主机记录（裸域请填 @）");
      return;
    }
    if (!value.trim()) {
      toast.error("请填写记录值");
      return;
    }
    const ttlNumber = Number(ttl);
    if (!Number.isFinite(ttlNumber) || ttlNumber < 1) {
      toast.error("TTL 必须是正整数");
      return;
    }

    const selectedLine = lineOptions.find((option) => option.code === line);
    const hostAddressId = bound ? bound.addressId : record?.host ? null : undefined;

    const payload = {
      name: name.trim() || "@",
      type,
      value: bound ? bound.ip : value.trim(),
      ttl: ttlNumber,
      line: selectedLine?.code ?? line,
      lineId: selectedLine?.id,
      priority: type === "MX" ? Number(priority) : undefined,
      remark: remark.trim() || undefined,
      status: enabled ? "ENABLE" : "DISABLE",
      ...(hostAddressId === undefined ? {} : { hostAddressId }),
      ...(editing && record ? { beforeRemoteUpdatedAt: record.remoteUpdatedAt } : {}),
    };

    setSaving(true);
    try {
      if (editing && record) {
        await api.patch(`/zones/${zoneId}/records/${record.remoteId}`, payload);
        toast.success("记录已更新");
      } else {
        await api.post(`/zones/${zoneId}/records`, payload);
        toast.success("记录已创建");
      }
      await queryClient.invalidateQueries({ queryKey: ["zone", zoneId] });
      await queryClient.invalidateQueries({ queryKey: ["hosts"] });
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑记录" : "新建记录"}</DialogTitle>
          <DialogDescription className="font-mono">{fqdn}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>类型</Label>
            <Select
              value={type}
              onValueChange={(next) => {
                setType(next);
                if (!ADDRESS_TYPES.includes(next)) setBound(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {knownRecordTypes.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>主机记录</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="@ 或 www" />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="flex items-center gap-2">
              记录值
              {isAddress ? (
                <span className="text-xs font-normal text-muted-foreground">A / AAAA 记录可直接选择主机</span>
              ) : null}
            </Label>
            {isAddress ? (
              <div className="space-y-2">
                <HostPicker value={bound} onChange={setBound} />
                {bound ? null : (
                  <Input
                    className="font-mono"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder="手填 IP，例如 1.2.3.4"
                  />
                )}
              </div>
            ) : (
              <Input
                className="font-mono"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={type === "CNAME" ? "api.example.com" : "记录值"}
              />
            )}
          </div>

          {type === "MX" ? (
            <div className="space-y-1.5">
              <Label>优先级</Label>
              <Input value={priority} onChange={(event) => setPriority(event.target.value)} />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>TTL</Label>
            <div className="flex gap-2">
              <Input value={ttl} onChange={(event) => setTtl(event.target.value)} className="font-mono" />
              <Select value={ttl} onValueChange={setTtl}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="常用" />
                </SelectTrigger>
                <SelectContent>
                  {TTL_PRESETS.map((preset) => (
                    <SelectItem key={preset} value={String(preset)}>
                      {preset}s
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>线路</Label>
            <Select value={line} onValueChange={setLine}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lineOptions.map((option) => (
                  <SelectItem key={option.code} value={option.code}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>备注</Label>
            <Textarea
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              rows={2}
              placeholder="可选"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 sm:col-span-2">
            <div>
              <p className="text-sm">启用记录</p>
              <p className="text-xs text-muted-foreground">关闭后该记录返回停用状态，但不会被删除</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {editing && changes.length > 0 ? (
            <div className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-3 sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground">变更预览</p>
              {changes.map((change) => (
                <div key={change.field} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="h-4 px-1 text-[10px]">
                    {change.label}
                  </Badge>
                  <span className="font-mono text-muted-foreground line-through">
                    {String(change.before ?? "—")}
                  </span>
                  <span>→</span>
                  <span className="font-mono">{String(change.after ?? "—")}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "提交中…" : editing ? "保存修改" : "创建记录"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

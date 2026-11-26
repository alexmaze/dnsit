import { Copy, MessageSquareText, MoreHorizontal, Pencil, Power, Server, Trash2 } from "lucide-react";
import type { NormalizedRecord, RecordStatus as RecordStatusValue } from "@dnsit/shared";
import { CopyButton, copyWithToast } from "@/components/CopyButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const recordTypeStyles: Record<string, string> = {
  A: "border-blue-500/15 bg-blue-500/8 text-blue-700 dark:text-blue-300",
  AAAA: "border-cyan-500/15 bg-cyan-500/8 text-cyan-700 dark:text-cyan-300",
  CNAME: "border-violet-500/15 bg-violet-500/8 text-violet-700 dark:text-violet-300",
  MX: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  TXT: "border-slate-500/15 bg-slate-500/8 text-slate-600 dark:text-slate-300",
  NS: "border-emerald-500/15 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
  SRV: "border-orange-500/15 bg-orange-500/8 text-orange-700 dark:text-orange-300",
};

export function RecordTypeBadge({ type }: { type: string }) {
  const normalizedType = type.toUpperCase();
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-11 shrink-0 items-center justify-center rounded-md border px-1.5 font-mono text-[10px] font-semibold tracking-wide",
        recordTypeStyles[normalizedType] ?? "border-border bg-muted/60 text-muted-foreground",
      )}
    >
      {type}
    </span>
  );
}

export function RecordStatus({ status }: { status: RecordStatusValue }) {
  const enabled = status === "ENABLE";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap",
        enabled ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          enabled ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      {enabled ? "启用" : "停用"}
    </span>
  );
}

export function RecordValue({ record }: { record: NormalizedRecord }) {
  return (
    <div className="min-w-0">
      <div className="group/copy flex min-w-0 items-center gap-1">
        <span className="truncate font-mono text-[13px] font-medium text-foreground/90" title={record.value}>
          {record.value}
        </span>
        <CopyButton text={record.value} label="记录值" />
      </div>
      {record.host ? (
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <Server className="size-3 shrink-0" />
          <span className="truncate">绑定主机：{record.host.hostName}</span>
          {record.host.drift === "VALUE_CHANGED" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 rounded-sm font-medium text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-amber-400"
                  aria-label={`记录值与主机 IP ${record.host.ip} 不一致`}
                >
                  IP 不一致
                </button>
              </TooltipTrigger>
              <TooltipContent>记录值与主机 IP {record.host.ip} 不一致</TooltipContent>
            </Tooltip>
          ) : (
            <span className="sr-only">主机 IP：{record.host.ip}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface RecordActionProps {
  record: NormalizedRecord;
  onEdit: (record: NormalizedRecord) => void;
  onDelete: (record: NormalizedRecord) => void;
  onToggle: (record: NormalizedRecord) => void;
}

export function RecordActions({ record, onEdit, onDelete, onToggle }: RecordActionProps) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 text-muted-foreground/70 hover:text-foreground"
            aria-label={`编辑 ${record.fqdn}`}
            onClick={() => onEdit(record)}
          >
            <Pencil className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>编辑记录</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 text-muted-foreground/70 hover:text-foreground"
            aria-label={`更多操作：${record.fqdn}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => onEdit(record)}>
            <Pencil className="size-3.5" /> 编辑记录
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onToggle(record)}>
            <Power className="size-3.5" /> {record.status === "ENABLE" ? "停用记录" : "启用记录"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void copyWithToast(record.fqdn, "完整域名")}>
            <Copy className="size-3.5" /> 复制完整域名
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void copyWithToast(record.value, "记录值")}>
            <Copy className="size-3.5" /> 复制记录值
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(record)}>
            <Trash2 className="size-3.5" /> 删除记录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function RecordRow({
  record,
  onEdit,
  onDelete,
  onToggle,
}: RecordActionProps) {
  return (
    <div className="group flex min-h-[58px] items-center gap-3 border-t border-border/50 px-3 py-2.5 transition-colors hover:bg-accent/25">
      <RecordTypeBadge type={record.type} />
      <div className="min-w-0 flex-1">
        <RecordValue record={record} />
        {record.remark ? (
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground" title={record.remark}>
            <MessageSquareText className="size-3 shrink-0" />
            <span className="truncate">{record.remark}</span>
          </p>
        ) : null}
      </div>
      <div className="hidden w-32 shrink-0 items-center gap-2 text-[11px] text-muted-foreground md:flex">
        <span className="font-mono text-foreground/65">{record.ttl}s</span>
        <span className="text-border">/</span>
        <span className="truncate">{record.line.label}</span>
      </div>
      <div className="w-14 shrink-0">
        <RecordStatus status={record.status} />
      </div>
      <RecordActions record={record} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} />
    </div>
  );
}

import { Copy, MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { NormalizedRecord } from "@dnsit/shared";
import { Badge } from "@/components/ui/badge";
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

export function RecordValue({ record }: { record: NormalizedRecord }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="truncate font-mono text-xs">{record.value}</span>
      {record.host ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className={cn(
                "h-4 shrink-0 gap-0.5 px-1 text-[10px]",
                record.host.drift !== "NONE" && "bg-amber-500/15 text-amber-500",
              )}
            >
              → {record.host.hostName}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {record.host.drift === "NONE"
              ? `已绑定主机 ${record.host.hostName}（${record.host.ip}）`
              : `记录值与主机 IP ${record.host.ip} 不一致`}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {record.host?.drift === "VALUE_CHANGED" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
          </TooltipTrigger>
          <TooltipContent>记录值已被改动，与主机 IP 不一致</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

export function RecordRow({
  record,
  depth = 0,
  onEdit,
  onDelete,
  onToggle,
}: {
  record: NormalizedRecord;
  depth?: number;
  onEdit: (record: NormalizedRecord) => void;
  onDelete: (record: NormalizedRecord) => void;
  onToggle: (record: NormalizedRecord) => void;
}) {
  return (
    <div
      className="group flex items-center gap-2 rounded-md py-1 pr-2 hover:bg-accent/40"
      style={{ paddingLeft: 24 + depth * 18 }}
    >
      <Badge variant="outline" className="h-5 w-14 shrink-0 justify-center font-mono text-[10px]">
        {record.type}
      </Badge>
      <div className="min-w-0 flex-1">
        <RecordValue record={record} />
      </div>
      <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted-foreground">{record.ttl}s</span>
      <span className="w-20 shrink-0 truncate text-[11px] text-muted-foreground">{record.line.label}</span>
      <span
        className={cn(
          "w-12 shrink-0 text-[11px]",
          record.status === "ENABLE" ? "text-muted-foreground" : "text-amber-500",
        )}
      >
        {record.status === "ENABLE" ? "启用" : "停用"}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-6 opacity-0 group-hover:opacity-100">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => onEdit(record)}>
            <Pencil className="size-3.5" /> 编辑
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onToggle(record)}>
            <Power className="size-3.5" /> {record.status === "ENABLE" ? "停用" : "启用"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(record.fqdn);
              toast.success(`已复制 ${record.fqdn}`);
            }}
          >
            <Copy className="size-3.5" /> 复制域名
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(record)}>
            <Trash2 className="size-3.5" /> 删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

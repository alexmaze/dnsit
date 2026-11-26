import type { HttpsCheckResult, HttpsCheckState } from "@dnsit/shared";
import { CircleAlert, CircleCheck, CircleX, Clock, MinusCircle, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface BadgeMeta {
  label: string;
  className: string;
  icon: LucideIcon;
}

function badgeMeta(result: HttpsCheckResult): BadgeMeta {
  const state: HttpsCheckState = result.state;
  switch (state) {
    case "OK":
      return {
        label: "HTTPS 正常",
        className: "border-emerald-500/20 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400",
        icon: CircleCheck,
      };
    case "HTTP_ERROR":
      return {
        label: result.httpStatus ? `HTTP ${result.httpStatus}` : "HTTP 异常",
        className: "border-amber-500/20 bg-amber-500/8 text-amber-700 dark:text-amber-400",
        icon: CircleAlert,
      };
    case "TIMEOUT":
      return {
        label: "连接超时",
        className: "border-amber-500/20 bg-amber-500/8 text-amber-700 dark:text-amber-400",
        icon: Clock,
      };
    case "DNS_ERROR":
      return {
        label: "解析失败",
        className: "border-destructive/20 bg-destructive/5 text-destructive",
        icon: CircleX,
      };
    case "TLS_ERROR":
      return {
        label: "证书错误",
        className: "border-destructive/20 bg-destructive/5 text-destructive",
        icon: CircleX,
      };
    case "NETWORK_ERROR":
      return {
        label: "连接失败",
        className: "border-destructive/20 bg-destructive/5 text-destructive",
        icon: CircleX,
      };
    case "INVALID":
      return {
        label: "无法测试",
        className: "border-border/70 bg-muted/40 text-muted-foreground",
        icon: MinusCircle,
      };
    default:
      return {
        label: "未知状态",
        className: "border-border/70 bg-muted/40 text-muted-foreground",
        icon: MinusCircle,
      };
  }
}

function formatCheckedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

/** 展示单个域名的 HTTPS 检测结果，悬停/聚焦可查看状态码、耗时与错误原因。 */
export function HttpsStatusBadge({ result }: { result?: HttpsCheckResult }) {
  if (!result) return null;
  const meta = badgeMeta(result);
  const Icon = meta.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`HTTPS 检测结果：${meta.label}`}
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[10px] font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            meta.className,
          )}
        >
          <Icon className="size-3" />
          {meta.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1">
          <p className="font-mono text-[11px]">{result.domain}</p>
          <p>
            结果：{meta.label}
            {result.httpStatus ? `（HTTP ${result.httpStatus}）` : ""}
          </p>
          <p>耗时：{result.elapsedMs} ms</p>
          {result.finalUrl && result.finalUrl !== `https://${result.domain}/` ? (
            <p className="break-all">最终地址：{result.finalUrl}</p>
          ) : null}
          {result.error ? <p>说明：{result.error}</p> : null}
          <p>检测于：{formatCheckedAt(result.checkedAt)}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

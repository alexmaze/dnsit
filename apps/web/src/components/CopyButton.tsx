import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/** 复制并按统一文案提示结果。 */
export async function copyWithToast(text: string, label: string) {
  const copied = await copyToClipboard(text);
  if (copied) {
    toast.success(`已复制${label}`);
  } else {
    toast.error("复制失败，请手动复制");
  }
}

interface CopyButtonProps {
  text: string;
  /** 复制内容的名称，例如「记录值」「完整域名」。 */
  label: string;
  tooltip?: string;
  className?: string;
}

/**
 * 统一的复制图标按钮。
 *
 * 桌面端悬停或聚焦所在的 `group/copy` 容器时显示，移动端始终显示；
 * 复制成功/失败均给出 toast 提示。
 */
export function CopyButton({ text, label, tooltip, className }: CopyButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(
            "size-6 shrink-0 text-muted-foreground opacity-100 transition-opacity focus-visible:opacity-100 md:opacity-0 md:group-focus-within/copy:opacity-100 md:group-hover/copy:opacity-100",
            className,
          )}
          aria-label={`复制${label} ${text}`}
          onClick={() => void copyWithToast(text, label)}
        >
          <Copy className="size-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip ?? `复制${label}`}</TooltipContent>
    </Tooltip>
  );
}

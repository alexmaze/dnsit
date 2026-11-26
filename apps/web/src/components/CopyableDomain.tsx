import type { MouseEvent } from "react";
import { CopyButton, copyWithToast } from "@/components/CopyButton";
import { cn } from "@/lib/utils";

interface CopyableDomainProps {
  domain: string;
  /** 提示语中的名称，例如「完整域名」「域名」。 */
  label?: string;
  className?: string;
}

/**
 * 可直接点击复制的域名文本。
 *
 * 文字本身可点击复制，右侧是与记录值一致的复制图标按钮；
 * 整体作为 `group/copy` 容器，桌面端悬停时显示复制图标。
 */
export function CopyableDomain({ domain, label = "完整域名", className }: CopyableDomainProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // 域名可能位于可展开行或链接卡片内，避免点击时触发外层行为。
    event.stopPropagation();
    void copyWithToast(domain, label);
  }

  return (
    <span className={cn("group/copy inline-flex min-w-0 max-w-full items-center gap-1", className)}>
      <button
        type="button"
        onClick={handleClick}
        className="min-w-0 truncate rounded-sm text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {domain}
      </button>
      <CopyButton text={domain} label={label} />
    </span>
  );
}

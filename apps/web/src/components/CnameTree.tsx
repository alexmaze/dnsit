import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Unlink, TriangleAlert } from "lucide-react";
import type { NormalizedRecord } from "@dnsit/shared";
import type { TreeNode, ZoneTree } from "@dnsit/shared";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RecordRow } from "@/components/RecordRow";
import { cn } from "@/lib/utils";

interface TreeProps {
  tree: ZoneTree;
  onEdit: (record: NormalizedRecord) => void;
  onDelete: (record: NormalizedRecord) => void;
  onToggle: (record: NormalizedRecord) => void;
  onJumpZone?: (zoneId: string, rr: string) => void;
}

function NodeBadges({ node }: { node: TreeNode }) {
  return (
    <>
      {node.dangling ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="h-4 gap-0.5 px-1 text-[10px]">
              <Unlink className="size-2.5" /> 未挂载
            </Badge>
          </TooltipTrigger>
          <TooltipContent>这个 CNAME 指向的记录在本域名内不存在</TooltipContent>
        </Tooltip>
      ) : null}
      {node.cycle ? (
        <Badge variant="destructive" className="h-4 gap-0.5 px-1 text-[10px]">
          <TriangleAlert className="size-2.5" /> 循环引用
        </Badge>
      ) : null}
      {node.disabledTarget ? (
        <Badge variant="outline" className="h-4 px-1 text-[10px] text-amber-500">
          目标已停用
        </Badge>
      ) : null}
      {node.multiTarget ? (
        <Badge variant="outline" className="h-4 px-1 text-[10px] text-muted-foreground">
          多目标
        </Badge>
      ) : null}
    </>
  );
}

function Branch({
  node,
  depth,
  onEdit,
  onDelete,
  onToggle,
  onJumpZone,
}: {
  node: TreeNode;
  depth: number;
} & Omit<TreeProps, "tree">) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md py-1 pr-2 hover:bg-accent/30",
          node.dangling && "bg-destructive/5",
        )}
        style={{ paddingLeft: 4 + depth * 18 }}
      >
        <button
          type="button"
          className={cn("flex size-4 shrink-0 items-center justify-center", !hasChildren && "opacity-30")}
          onClick={() => setOpen((value) => !value)}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            open ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )
          ) : (
            <span className="size-1 rounded-full bg-muted-foreground/40" />
          )}
        </button>
        <span className="font-mono text-sm font-medium">{node.name === "@" ? "@" : node.name}</span>
        <span className="truncate text-[11px] text-muted-foreground">{node.fqdn}</span>
        <NodeBadges node={node} />
        {node.dangling ? (
          <span className="text-[11px] text-destructive/80">该 CNAME 指向的记录不存在</span>
        ) : null}
      </div>

      {node.dangling ? null : (
        <div className="space-y-0.5">
          {node.records.map((record) => (
            <RecordRow
              key={record.id}
              record={record}
              depth={depth}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}

      {node.externals.map((external, index) => (
        <div
          key={`${external.fqdn}-${index}`}
          className="flex items-center gap-2 py-0.5 text-[11px] text-muted-foreground"
          style={{ paddingLeft: 24 + depth * 18 }}
        >
          <ExternalLink className="size-3" />
          外部目标 <span className="font-mono">{external.fqdn}</span>
          {external.inPlatform ? (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => {
                const rr = external.fqdn.replace(/\.?[^.]+\.[^.]+$/, "");
                if (external.zoneId) onJumpZone?.(external.zoneId, rr);
              }}
            >
              在平台内，前往查看
            </button>
          ) : (
            <span className="opacity-60">平台未接入</span>
          )}
        </div>
      ))}

      {open && hasChildren ? (
        <div>
          {node.children.map((edge) => (
            <Branch
              key={`${edge.via.id}-${edge.node.name}`}
              node={edge.node}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggle={onToggle}
              onJumpZone={onJumpZone}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CnameTree({ tree, onEdit, onDelete, onToggle, onJumpZone }: TreeProps) {
  if (tree.roots.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">没有匹配的记录</p>;
  }
  return (
    <div className="space-y-1 pb-8">
      {tree.roots.map((node) => (
        <Branch
          key={node.name}
          node={node}
          depth={0}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
          onJumpZone={onJumpZone}
        />
      ))}
    </div>
  );
}

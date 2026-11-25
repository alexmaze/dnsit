import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CornerDownRight,
  ExternalLink,
  GitBranch,
  Globe,
  Link2,
  SearchX,
  TriangleAlert,
  Unlink,
} from "lucide-react";
import type { NormalizedRecord, TreeEdge, TreeNode, ZoneTree } from "@dnsit/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RecordRow } from "@/components/RecordRow";
import { cn } from "@/lib/utils";

interface TreeProps {
  tree: ZoneTree;
  visibleRecordIds?: ReadonlySet<string>;
  onEdit: (record: NormalizedRecord) => void;
  onDelete: (record: NormalizedRecord) => void;
  onToggle: (record: NormalizedRecord) => void;
  onJumpZone?: (zoneId: string, rr: string) => void;
  onResetFilters?: () => void;
}

type Expansion = { mode: "default" | "expanded" | "collapsed"; version: number };

function normalizeTarget(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function createVisibilityModel(tree: ZoneTree, visibleRecordIds?: ReadonlySet<string>) {
  const visibleEdges = new Set<TreeEdge>();
  if (!visibleRecordIds) {
    return { visibleEdges, hasVisibleNode: (_node: TreeNode) => true };
  }

  const edgeOwners = new Map<TreeEdge, TreeNode>();
  const incomingEdges = new Map<TreeNode, TreeEdge[]>();
  const queue: TreeEdge[] = [];

  for (const node of tree.nodes.values()) {
    for (const edge of node.children) {
      edgeOwners.set(edge, node);
      const incoming = incomingEdges.get(edge.node) ?? [];
      incoming.push(edge);
      incomingEdges.set(edge.node, incoming);
    }
  }

  function markVisible(edge: TreeEdge) {
    if (visibleEdges.has(edge)) return;
    visibleEdges.add(edge);
    queue.push(edge);
  }

  for (const node of tree.nodes.values()) {
    for (const edge of node.children) {
      if (visibleRecordIds.has(edge.via.id)) markVisible(edge);
    }
  }

  // 从匹配的 CNAME 边向目标方向传播，保留必要的祖先上下文。
  // 使用有限边集合做不动点计算，不受循环或子节点顺序影响。
  for (let index = 0; index < queue.length; index += 1) {
    const childEdge = queue[index];
    const owner = edgeOwners.get(childEdge);
    if (!owner) continue;
    for (const parentEdge of incomingEdges.get(owner) ?? []) markVisible(parentEdge);
  }

  return {
    visibleEdges,
    hasVisibleNode: (node: TreeNode) =>
      node.records.some((record) => visibleRecordIds.has(record.id)) ||
      node.children.some((edge) => visibleEdges.has(edge)),
  };
}

function NodeBadges({ node }: { node: TreeNode }) {
  return (
    <>
      {node.dangling ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="h-5 gap-1 border-destructive/20 bg-destructive/5 px-1.5 text-[10px] font-medium text-destructive"
            >
              <Unlink className="size-2.5" /> 未挂载
            </Badge>
          </TooltipTrigger>
          <TooltipContent>这个 CNAME 指向的记录在本域名内不存在</TooltipContent>
        </Tooltip>
      ) : null}
      {node.cycle ? (
        <Badge
          variant="outline"
          className="h-5 gap-1 border-destructive/20 bg-destructive/5 px-1.5 text-[10px] font-medium text-destructive"
        >
          <TriangleAlert className="size-2.5" /> 循环引用
        </Badge>
      ) : null}
      {node.disabledTarget ? (
        <Badge
          variant="outline"
          className="h-5 border-amber-500/20 bg-amber-500/5 px-1.5 text-[10px] font-normal text-amber-700 dark:text-amber-400"
        >
          目标已停用
        </Badge>
      ) : null}
      {node.multiTarget ? (
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground">
          多目标
        </Badge>
      ) : null}
    </>
  );
}

function Branch({
  node,
  depth,
  expansion,
  ancestors,
  visibleEdges,
  visibleRecordIds,
  onEdit,
  onDelete,
  onToggle,
  onJumpZone,
}: {
  node: TreeNode;
  depth: number;
  expansion: Expansion;
  ancestors: ReadonlySet<TreeNode>;
  visibleEdges: ReadonlySet<TreeEdge>;
} & Omit<TreeProps, "tree" | "onResetFilters">) {
  const [open, setOpen] = useState(depth < 1);
  const repeatsAncestor = ancestors.has(node);
  const visibleRecords = visibleRecordIds
    ? node.records.filter((record) => visibleRecordIds.has(record.id))
    : node.records;
  const visibleChildren = visibleRecordIds
    ? node.children.filter((edge) => visibleEdges.has(edge))
    : node.children;
  const visibleExternals = visibleRecordIds
    ? node.externals.filter((external) =>
        visibleRecords.some(
          (record) => record.type.toUpperCase() === "CNAME" && normalizeTarget(record.value) === external.fqdn,
        ),
      )
    : node.externals;
  const hasChildren = visibleChildren.length > 0;
  const hiddenRecordCount = node.records.length - visibleRecords.length;
  const statusDescription = [
    node.dangling ? "目标不存在" : "",
    node.cycle ? "存在循环引用" : "",
    node.disabledTarget ? "目标已停用" : "",
  ]
    .filter(Boolean)
    .join("，");

  useEffect(() => {
    setOpen(expansion.mode === "expanded" || (expansion.mode === "default" && depth < 1));
  }, [expansion, depth]);

  const actionLabel = repeatsAncestor
    ? "循环回边"
    : hasChildren
      ? `${open ? "收起" : "展开"} ${node.fqdn} 的引用记录`
      : node.fqdn;

  return (
    <div>
      <div
        className={cn(
          "flex min-h-[62px] items-center gap-3 px-3 py-2.5",
          depth === 0 ? "bg-muted/30" : "bg-card",
          node.dangling && "bg-destructive/[0.035]",
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => setOpen((value) => !value)}
          disabled={!hasChildren || repeatsAncestor}
          aria-expanded={hasChildren ? open && !repeatsAncestor : undefined}
          aria-label={`${actionLabel}${statusDescription ? `，${statusDescription}` : ""}`}
        >
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
              hasChildren && !repeatsAncestor && "hover:bg-accent hover:text-foreground",
            )}
          >
            {hasChildren ? (
              open && !repeatsAncestor ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )
            ) : (
              <span className="size-1 rounded-full bg-muted-foreground/30" />
            )}
          </span>
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg border",
              depth === 0
                ? "border-blue-500/15 bg-blue-500/8 text-blue-600 dark:text-blue-400"
                : "border-border/70 bg-muted/50 text-muted-foreground",
            )}
          >
            {depth === 0 ? <Globe className="size-4" /> : <Link2 className="size-3.5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-sm font-semibold tracking-tight text-foreground">{node.name}</span>
              <NodeBadges node={node} />
            </span>
            <span className="mt-0.5 block truncate font-mono text-[11px] font-normal text-muted-foreground">
              {node.fqdn}
            </span>
          </span>
        </button>
        <div className="hidden shrink-0 items-center gap-3 text-[11px] text-muted-foreground sm:flex">
          {!node.dangling ? (
            <span>
              {visibleRecordIds && hiddenRecordCount > 0
                ? `${visibleRecords.length} / ${node.records.length} 条记录`
                : `${node.records.length} 条记录`}
            </span>
          ) : null}
          {hasChildren ? (
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="size-3" /> {visibleChildren.length} 个引用
            </span>
          ) : null}
        </div>
      </div>

      {!node.dangling && (visibleRecords.length > 0 || hiddenRecordCount > 0) ? (
        <div className="bg-card">
          {visibleRecords.map((record) => (
            <RecordRow key={record.id} record={record} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} />
          ))}
          {hiddenRecordCount > 0 ? (
            <p className="border-t border-border/50 bg-muted/10 px-4 py-2 text-[11px] text-muted-foreground">
              当前筛选隐藏了 {hiddenRecordCount} 条目标记录，完整解析关系仍保留。
            </p>
          ) : null}
        </div>
      ) : null}

      {visibleExternals.length > 0 ? (
        <div className="space-y-2 border-t border-border/50 bg-muted/10 px-4 py-3">
          {visibleExternals.map((external, index) => (
            <div key={`${external.fqdn}-${index}`} className="flex min-w-0 flex-wrap items-center gap-2 text-[11px]">
              <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="shrink-0 text-muted-foreground">外部目标</span>
              <span className="min-w-0 truncate font-mono text-xs font-medium text-foreground/75">{external.fqdn}</span>
              {external.inPlatform ? (
                <button
                  type="button"
                  className="ml-auto inline-flex items-center gap-1 rounded-sm font-medium text-blue-600 hover:text-blue-700 hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-blue-400"
                  onClick={() => {
                    const rr = external.fqdn.replace(/\.?[^.]+\.[^.]+$/, "");
                    if (external.zoneId) onJumpZone?.(external.zoneId, rr);
                  }}
                >
                  前往查看 <ChevronRight className="size-3" />
                </button>
              ) : (
                <span className="ml-auto text-muted-foreground/60">平台未接入</span>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {open && hasChildren && !repeatsAncestor ? (
        <div className="border-t border-border/60 bg-muted/10 px-2 py-3 sm:px-5">
          <div className="mb-2 flex items-center gap-1.5 pl-1 text-[10px] font-medium tracking-wide text-muted-foreground">
            <CornerDownRight className="size-3" /> 引用此目标的 CNAME
          </div>
          <div className="relative ml-1 space-y-2 border-l border-border/80 pl-2 sm:ml-3 sm:pl-4">
            {visibleChildren.map((edge) => (
              <div key={`${edge.via.id}-${edge.node.name}`} className="relative">
                <span className="absolute top-[30px] -left-2 h-px w-2 bg-border/80 sm:-left-4 sm:w-4" />
                <div className="overflow-hidden rounded-lg border border-border/65 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.025)]">
                  <Branch
                    node={edge.node}
                    depth={depth + 1}
                    expansion={expansion}
                    ancestors={new Set(ancestors).add(node)}
                    visibleEdges={visibleEdges}
                    visibleRecordIds={visibleRecordIds}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onToggle={onToggle}
                    onJumpZone={onJumpZone}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CnameTree({
  tree,
  visibleRecordIds,
  onEdit,
  onDelete,
  onToggle,
  onJumpZone,
  onResetFilters,
}: TreeProps) {
  const [expansion, setExpansion] = useState<Expansion>({ mode: "default", version: 0 });
  const visibility = useMemo(() => createVisibilityModel(tree, visibleRecordIds), [tree, visibleRecordIds]);
  const visibleRoots = tree.roots.filter(visibility.hasVisibleNode);

  if (visibleRoots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center">
        <SearchX className="mx-auto size-7 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">没有找到匹配的解析链路</p>
        <p className="mt-1 text-xs text-muted-foreground">试试更换关键词，或清除类型和状态筛选。</p>
        {onResetFilters ? (
          <Button variant="outline" size="sm" className="mt-4" onClick={onResetFilters}>
            清除筛选
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-8">
      <div className="flex flex-col gap-3 px-0.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">解析链路</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">从目标记录出发，逐层查看引用它的 CNAME。</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 bg-card text-xs shadow-none"
            onClick={() => setExpansion((current) => ({ mode: "expanded", version: current.version + 1 }))}
          >
            <ChevronsUpDown className="size-3.5" /> 展开全部
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 bg-card text-xs shadow-none"
            onClick={() => setExpansion((current) => ({ mode: "collapsed", version: current.version + 1 }))}
          >
            <ChevronsDownUp className="size-3.5" /> 收起全部
          </Button>
        </div>
      </div>
      {visibleRoots.map((node) => (
        <section
          key={node.name}
          className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]"
          aria-label={`${node.fqdn} 解析链路`}
        >
          <Branch
            node={node}
            depth={0}
            expansion={expansion}
            ancestors={new Set<TreeNode>()}
            visibleEdges={visibility.visibleEdges}
            visibleRecordIds={visibleRecordIds}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggle={onToggle}
            onJumpZone={onJumpZone}
          />
        </section>
      ))}
    </div>
  );
}

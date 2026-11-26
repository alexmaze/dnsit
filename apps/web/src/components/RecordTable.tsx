import { useMemo, useState } from "react";
import type { HttpsCheckResult, NormalizedRecord } from "@dnsit/shared";
import { CopyableDomain } from "@/components/CopyableDomain";
import { HttpsStatusBadge } from "@/components/HttpsStatusBadge";
import { RecordActions, RecordStatus, RecordTypeBadge, RecordValue } from "@/components/RecordRow";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowDown, ArrowUp, ArrowUpDown, SearchX } from "lucide-react";
import { domainKey } from "@/lib/domain";
import { cn } from "@/lib/utils";

type SortKey = "name" | "type" | "ttl" | "status";
type SortDirection = "asc" | "desc";

function sortAriaState(column: SortKey, sort: { key: SortKey; direction: SortDirection }) {
  if (sort.key !== column) return "none" as const;
  return sort.direction === "asc" ? ("ascending" as const) : ("descending" as const);
}

function SortableHeader({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: SortKey;
  sort: { key: SortKey; direction: SortDirection };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === column;
  return (
    <button
      type="button"
      className={cn(
        "-my-1 inline-flex min-h-6 items-center gap-1 rounded-sm px-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active && "text-foreground",
      )}
      onClick={() => onSort(column)}
      aria-label={`按${label}排序`}
      title={`按${label}排序`}
    >
      {label}
      {active ? (
        sort.direction === "asc" ? (
          <ArrowUp className="size-3" />
        ) : (
          <ArrowDown className="size-3" />
        )
      ) : (
        <ArrowUpDown className="size-3 opacity-45" />
      )}
    </button>
  );
}

export function RecordTable({
  records,
  onEdit,
  onDelete,
  onToggle,
  onResetFilters,
  httpsResults,
}: {
  records: NormalizedRecord[];
  onEdit: (record: NormalizedRecord) => void;
  onDelete: (record: NormalizedRecord) => void;
  onToggle: (record: NormalizedRecord) => void;
  onResetFilters?: () => void;
  httpsResults?: Record<string, HttpsCheckResult>;
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "name", direction: "asc" });

  const sortedRecords = useMemo(() => {
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...records].sort((a, b) => {
      if (sort.key === "ttl") return (a.ttl - b.ttl) * direction;
      const left = sort.key === "name" ? a.name : sort.key === "type" ? a.type : a.status;
      const right = sort.key === "name" ? b.name : sort.key === "type" ? b.type : b.status;
      return left.localeCompare(right, "zh-CN", { numeric: true }) * direction;
    });
  }, [records, sort]);

  function changeSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center">
        <SearchX className="mx-auto size-7 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">没有找到匹配的解析记录</p>
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
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]">
      <Table className="min-w-[1128px] table-fixed" aria-label="解析记录列表">
        <TableHeader className="bg-muted/45">
          <TableRow className="border-border/70 hover:bg-transparent">
            <TableHead
              aria-sort={sortAriaState("name", sort)}
              className="h-10 w-[220px] px-4 text-[11px] font-medium text-muted-foreground"
            >
              <SortableHeader label="主机记录" column="name" sort={sort} onSort={changeSort} />
            </TableHead>
            <TableHead
              aria-sort={sortAriaState("type", sort)}
              className="h-10 w-20 px-3 text-[11px] font-medium text-muted-foreground"
            >
              <SortableHeader label="类型" column="type" sort={sort} onSort={changeSort} />
            </TableHead>
            <TableHead className="h-10 px-3 text-[11px] font-medium text-muted-foreground">记录值</TableHead>
            <TableHead className="h-10 w-[170px] px-3 text-[11px] font-medium text-muted-foreground">备注</TableHead>
            <TableHead
              aria-sort={sortAriaState("ttl", sort)}
              className="h-10 w-[110px] px-3 text-[11px] font-medium text-muted-foreground"
            >
              <SortableHeader label="TTL / 线路" column="ttl" sort={sort} onSort={changeSort} />
            </TableHead>
            <TableHead
              aria-sort={sortAriaState("status", sort)}
              className="h-10 w-[76px] px-3 text-[11px] font-medium text-muted-foreground"
            >
              <SortableHeader label="状态" column="status" sort={sort} onSort={changeSort} />
            </TableHead>
            <TableHead className="h-10 w-[108px] px-3 text-[11px] font-medium text-muted-foreground">HTTPS 检测</TableHead>
            <TableHead className="sticky right-0 z-20 h-10 w-[76px] border-l border-border/60 bg-muted px-3">
              <span className="sr-only">操作</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRecords.map((record) => (
            <TableRow
              key={record.id}
              className="group border-border/55 transition-colors hover:bg-blue-500/[0.025] dark:hover:bg-blue-400/[0.035]"
            >
              <TableCell className="px-4 py-3 whitespace-normal">
                <div className="flex min-w-0 flex-col items-start">
                  <button
                    type="button"
                    className="max-w-full min-w-0 truncate rounded-sm text-left text-[13px] font-semibold text-foreground transition-colors group-hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none dark:group-hover:text-blue-300"
                    onClick={() => onEdit(record)}
                    title={`编辑 ${record.fqdn}`}
                  >
                    {record.name}
                  </button>
                  <CopyableDomain
                    domain={record.fqdn}
                    label="完整域名"
                    className="mt-1 font-mono text-[11px] font-normal text-muted-foreground transition-colors hover:text-foreground"
                  />
                </div>
              </TableCell>
              <TableCell className="px-3 py-3">
                <RecordTypeBadge type={record.type} />
              </TableCell>
              <TableCell className="min-w-0 px-3 py-3">
                <RecordValue record={record} />
              </TableCell>
              <TableCell className="px-3 py-3 whitespace-normal">
                {record.remark ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="line-clamp-2 cursor-default rounded-sm text-[11px] leading-5 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                        {record.remark}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">{record.remark}</TooltipContent>
                  </Tooltip>
                ) : (
                  <span className="text-xs text-muted-foreground/35">—</span>
                )}
              </TableCell>
              <TableCell className="px-3 py-3">
                <p className="font-mono text-xs text-foreground/70">{record.ttl}s</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground" title={record.line.label}>
                  {record.line.label}
                </p>
              </TableCell>
              <TableCell className="px-3 py-3">
                <RecordStatus status={record.status} />
              </TableCell>
              <TableCell className="px-3 py-3">
                {httpsResults?.[domainKey(record.fqdn)] ? (
                  <HttpsStatusBadge result={httpsResults[domainKey(record.fqdn)]} />
                ) : (
                  <span className="text-xs text-muted-foreground/35">—</span>
                )}
              </TableCell>
              <TableCell className="sticky right-0 z-[5] border-l border-border/45 bg-card px-3 py-3">
                <RecordActions record={record} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

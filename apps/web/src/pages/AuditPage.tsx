import { useState } from "react";
import { useAudit } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACTION_LABEL, formatTime } from "@/lib/format";

export function AuditPage() {
  const [page, setPage] = useState(1);
  const audit = useAudit(page);
  const items = audit.data?.items ?? [];
  const total = audit.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">变更记录</h1>
            <p className="text-sm text-muted-foreground">所有写操作都会留下 before / after 快照</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </Button>
            <span>
              {page} / {pageCount}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
              下一页
            </Button>
          </div>
        </header>

        {audit.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">还没有任何变更</p>
        ) : (
          <div className="rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">时间</TableHead>
                  <TableHead className="w-32">动作</TableHead>
                  <TableHead className="w-40">域名</TableHead>
                  <TableHead>详情</TableHead>
                  <TableHead className="w-24">结果</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{formatTime(item.createdAt)}</TableCell>
                    <TableCell className="text-sm">{ACTION_LABEL[item.action] ?? item.action}</TableCell>
                    <TableCell className="text-sm">{item.zoneName}</TableCell>
                    <TableCell className="max-w-[420px] truncate text-xs text-muted-foreground">
                      {item.errorMessage ??
                        describe(item.after) ??
                        describe(item.before) ??
                        "—"}
                      {item.requestId ? (
                        <span className="ml-2 font-mono text-[10px] opacity-60">req {item.requestId}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          item.result === "SUCCESS" ? "secondary" : item.result === "PARTIAL" ? "outline" : "destructive"
                        }
                        className="text-[10px]"
                      >
                        {item.result}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function describe(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const name = typeof record.fqdn === "string" ? record.fqdn : typeof record.name === "string" ? record.name : undefined;
  const type = typeof record.type === "string" ? record.type : undefined;
  const content = typeof record.value === "string" ? record.value : undefined;
  if (name && type && content) return `${name} ${type} → ${content}`;
  if (typeof record.status === "string") return `status → ${record.status}`;
  return undefined;
}

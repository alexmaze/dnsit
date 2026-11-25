import type { NormalizedRecord } from "@dnsit/shared";
import { RecordValue } from "@/components/RecordRow";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function RecordTable({
  records,
  onEdit,
  onDelete,
  onToggle,
}: {
  records: NormalizedRecord[];
  onEdit: (record: NormalizedRecord) => void;
  onDelete: (record: NormalizedRecord) => void;
  onToggle: (record: NormalizedRecord) => void;
}) {
  if (records.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">没有匹配的记录</p>;
  }
  return (
    <div className="rounded-lg border border-border/60">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40">主机记录</TableHead>
            <TableHead className="w-20">类型</TableHead>
            <TableHead>值</TableHead>
            <TableHead className="w-20 text-right">TTL</TableHead>
            <TableHead className="w-24">线路</TableHead>
            <TableHead className="w-20">状态</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="font-mono text-xs">{record.name === "@" ? "@" : record.name}</TableCell>
              <TableCell>
                <Badge variant="outline" className="h-5 justify-center font-mono text-[10px]">
                  {record.type}
                </Badge>
              </TableCell>
              <TableCell className="max-w-[420px]">
                <RecordValue record={record} />
              </TableCell>
              <TableCell className="text-right font-mono text-[11px] text-muted-foreground">{record.ttl}</TableCell>
              <TableCell className="truncate text-[11px] text-muted-foreground">{record.line.label}</TableCell>
              <TableCell>
                <span className={cn("text-[11px]", record.status === "ENABLE" ? "text-muted-foreground" : "text-amber-500")}>
                  {record.status === "ENABLE" ? "启用" : "停用"}
                </span>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7">
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(record)}>
                      <Pencil className="size-3.5" /> 编辑
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggle(record)}>
                      <Power className="size-3.5" /> {record.status === "ENABLE" ? "停用" : "启用"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => onDelete(record)}>
                      <Trash2 className="size-3.5" /> 删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

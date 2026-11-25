import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Cloud, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AccountSummary } from "@dnsit/shared";
import { api, errorMessage } from "@/api/client";
import { useAccounts } from "@/api/queries";
import { AccountDialog } from "@/components/AccountDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTime, PROVIDER_LABEL } from "@/lib/format";

const STATUS: Record<string, { label: string; variant: "secondary" | "destructive" | "outline" }> = {
  ok: { label: "正常", variant: "secondary" },
  invalid: { label: "凭据失效", variant: "destructive" },
  unverified: { label: "未校验", variant: "outline" },
};

export function AccountsPage() {
  const accounts = useAccounts();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AccountSummary | undefined>(undefined);
  const [deleting, setDeleting] = useState<AccountSummary | undefined>(undefined);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  async function verify(account: AccountSummary) {
    setVerifying(account.id);
    try {
      await api.post(`/accounts/${account.id}/verify`);
      toast.success(`「${account.name}」凭据有效`);
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    } finally {
      setVerifying(null);
    }
  }

  async function remove() {
    if (!deleting) return;
    setRemoving(true);
    try {
      const result = await api.del<{ zones: number; records: number }>(`/accounts/${deleting.id}`);
      toast.success(
        `已删除「${deleting.name}」，清掉 ${result.zones} 个域名、${result.records} 条记录缓存（云端未改动）`,
      );
      await queryClient.invalidateQueries();
      setDeleting(undefined);
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setRemoving(false);
    }
  }

  const rows = accounts.data ?? [];

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <header className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold">云账号</h1>
            <p className="text-sm text-muted-foreground">
              每个账号对应一组 AK/SK。删除账号只会清掉本地缓存的域名与记录，不会改动云上的任何解析。
            </p>
          </div>
          <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" /> 添加云账号
          </Button>
        </header>

        {accounts.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 py-16 text-center">
            <Cloud className="mx-auto mb-2 size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">还没有接入任何云账号</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreateOpen(true)}>
              接入第一个账号
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">备注名</TableHead>
                  <TableHead className="w-24">厂商</TableHead>
                  <TableHead className="w-44">AccessKeyId</TableHead>
                  <TableHead className="w-28">状态</TableHead>
                  <TableHead className="w-20 text-right">域名</TableHead>
                  <TableHead className="w-44">最后校验</TableHead>
                  <TableHead className="w-52" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((account) => {
                  const status = STATUS[account.status] ?? STATUS.unverified!;
                  return (
                    <TableRow key={account.id}>
                      <TableCell>
                        <span className="font-medium">{account.name}</span>
                        {account.readonly ? (
                          <Badge variant="outline" className="ml-2 h-4 px-1 text-[10px]">
                            只读
                          </Badge>
                        ) : null}
                        {account.lastError ? (
                          <p className="max-w-56 truncate text-[11px] text-destructive">{account.lastError}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {PROVIDER_LABEL[account.provider] ?? account.provider}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {account.accessKeyMasked}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="text-[10px]">
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs">{account.zoneCount}</TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">
                        {formatTime(account.lastVerifiedAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={verifying === account.id}
                            onClick={() => verify(account)}
                          >
                            <RefreshCw className={`size-3 ${verifying === account.id ? "animate-spin" : ""}`} />
                            校验
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setEditing(account)}
                          >
                            <Pencil className="size-3" /> 编辑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => setDeleting(account)}
                          >
                            <Trash2 className="size-3" /> 删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {createOpen ? <AccountDialog open onOpenChange={(open) => (open ? undefined : setCreateOpen(false))} /> : null}
      {editing ? (
        <AccountDialog
          key={editing.id}
          open
          account={editing}
          onOpenChange={(open) => (open ? undefined : setEditing(undefined))}
        />
      ) : null}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => (open ? undefined : setDeleting(undefined))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除账号「{deleting?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              会移除该账号下 {deleting?.zoneCount ?? 0} 个域名的本地缓存与记录缓存，并解除相关的
              主机绑定关系。云上解析不受影响，重新添加账号即可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? "删除中…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { NormalizedRecord } from "@dnsit/shared";
import { api, errorMessage } from "@/api/client";
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
import { Checkbox } from "@/components/ui/checkbox";

export function DeleteRecordDialog({
  record,
  zoneId,
  onOpenChange,
}: {
  record: NormalizedRecord | null;
  zoneId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [dependents, setDependents] = useState<NormalizedRecord[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setAcknowledged(false);
    if (!record) {
      setDependents([]);
      return;
    }
    api
      .get<NormalizedRecord[]>(`/zones/${zoneId}/records/${record.remoteId}/dependents`)
      .then(setDependents)
      .catch(() => setDependents([]));
  }, [record, zoneId]);

  async function submit() {
    if (!record) return;
    setDeleting(true);
    try {
      await api.del(`/zones/${zoneId}/records/${record.remoteId}${dependents.length > 0 ? "?force=1" : ""}`);
      toast.success("记录已删除");
      await queryClient.invalidateQueries({ queryKey: ["zone", zoneId] });
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={Boolean(record)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除这条记录？</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p className="font-mono text-sm">
                {record?.fqdn} · {record?.type} → {record?.value}
              </p>
              {dependents.length > 0 ? (
                <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                  <p className="text-sm font-medium text-destructive">
                    有 {dependents.length} 条 CNAME 记录指向它，删除后这些记录会解析失败
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {dependents.map((item) => (
                      <Badge key={item.id} variant="outline" className="font-mono text-[10px]">
                        {item.fqdn}
                      </Badge>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 pt-1 text-xs">
                    <Checkbox checked={acknowledged} onCheckedChange={(value) => setAcknowledged(Boolean(value))} />
                    我已了解下游会受影响
                  </label>
                </div>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting || (dependents.length > 0 && !acknowledged)}
            onClick={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? "删除中…" : "确认删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

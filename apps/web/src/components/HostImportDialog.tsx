import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface PreviewRow {
  line: number;
  name: string;
  ips: string[];
  ok: boolean;
  errors: string[];
}

export function HostImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function runPreview() {
    setBusy(true);
    try {
      setPreview(await api.post<PreviewRow[]>("/hosts/import", { text }));
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const result = await api.post<{ created: number; skipped: number }>("/hosts/import/confirm", { text });
      toast.success(`导入完成：新增 ${result.created} 台，跳过 ${result.skipped} 行`);
      await queryClient.invalidateQueries({ queryKey: ["hosts"] });
      setText("");
      setPreview(null);
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setBusy(false);
    }
  }

  const valid = preview?.filter((row) => row.ok).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>批量导入主机</DialogTitle>
          <DialogDescription>
            每行「主机名 IP [IP2 ...]」，支持 # 注释。先预览，确认后再写入。
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setPreview(null);
          }}
          rows={6}
          className="font-mono text-xs"
          placeholder={"web-01 1.2.3.4\nweb-02 1.2.3.5 10.0.0.5\n# 注释行会被忽略"}
        />

        {preview ? (
          <div className="max-h-64 overflow-auto rounded-md border border-border/60">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">行</th>
                  <th className="p-2 text-left">主机名</th>
                  <th className="p-2 text-left">IP</th>
                  <th className="p-2 text-left">状态</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.line} className="border-t border-border/40">
                    <td className="p-2 font-mono text-muted-foreground">{row.line}</td>
                    <td className="p-2 font-mono">{row.name}</td>
                    <td className="p-2 font-mono">{row.ips.join(", ") || "—"}</td>
                    <td className="p-2">
                      {row.ok ? (
                        <Badge variant="secondary" className="text-[10px]">可导入</Badge>
                      ) : (
                        <span className="text-destructive">{row.errors.join("；")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button variant="outline" onClick={runPreview} disabled={busy || !text.trim()}>
            预览
          </Button>
          <Button onClick={confirm} disabled={busy || valid === 0}>
            {busy ? "处理中…" : `导入 ${valid} 台`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

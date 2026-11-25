import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Server, Globe, History, Plus, RefreshCw, CloudCog } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { AccountSummary, ZoneSummary } from "@dnsit/shared";
import { api } from "@/api/client";
import { useAccounts, useZones } from "@/api/queries";
import { AccountDialog } from "@/components/AccountDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PROVIDER_LABEL } from "@/lib/format";

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
    isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
  );
}

function ZoneGroup({
  account,
  zones,
}: {
  account: AccountSummary;
  zones: ZoneSummary[];
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-2 pt-3 pb-1">
        <span className="truncate text-xs font-medium text-muted-foreground">{account.name}</span>
        <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
          {PROVIDER_LABEL[account.provider] ?? account.provider}
        </Badge>
        {account.status === "invalid" ? (
          <Badge variant="destructive" className="h-4 px-1 text-[10px]">
            AK 失效
          </Badge>
        ) : null}
      </div>
      {zones.length === 0 ? (
        <p className="px-2 pb-1 text-xs text-muted-foreground/70">没有域名</p>
      ) : (
        zones.map((zone) => (
          <NavLink key={zone.id} to={`/zones/${zone.id}`} className={navClass}>
            <Globe className="size-3.5 shrink-0 opacity-70" />
            <span className="truncate">{zone.name}</span>
            <span className="ml-auto text-[10px] text-muted-foreground/70">{zone.recordCount}</span>
          </NavLink>
        ))
      )}
    </div>
  );
}

export function AppShell() {
  const queryClient = useQueryClient();
  const accounts = useAccounts();
  const zones = useZones();
  const [accountDialog, setAccountDialog] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const grouped = new Map<string, ZoneSummary[]>();
  for (const zone of zones.data ?? []) {
    const list = grouped.get(zone.accountId) ?? [];
    list.push(zone);
    grouped.set(zone.accountId, list);
  }

  async function syncAll() {
    setSyncing(true);
    try {
      await api.post("/zones/sync");
      await queryClient.invalidateQueries();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar">
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-3">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            D
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">dnsit</p>
            <p className="truncate text-[11px] text-muted-foreground">多云域名与解析</p>
          </div>
          <ThemeToggle />
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={syncAll}
            disabled={syncing}
            title="刷新所有域名"
          >
            <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {(accounts.data ?? []).map((account) => (
              <ZoneGroup key={account.id} account={account} zones={grouped.get(account.id) ?? []} />
            ))}
            {accounts.isLoading ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-40" />
              </div>
            ) : null}
            {accounts.data?.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                还没有接入任何云账号
              </p>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full justify-start text-muted-foreground"
              onClick={() => setAccountDialog(true)}
            >
              <Plus className="size-3.5" /> 添加云账号
            </Button>
          </div>
        </ScrollArea>

        <div className="space-y-0.5 border-t border-border/60 p-2">
          <NavLink to="/accounts" className={navClass}>
            <CloudCog className="size-3.5 opacity-70" />
            云账号
          </NavLink>
          <NavLink to="/hosts" className={navClass}>
            <Server className="size-3.5 opacity-70" />
            主机
          </NavLink>
          <NavLink to="/audit" className={navClass}>
            <History className="size-3.5 opacity-70" />
            变更记录
          </NavLink>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">
        <Outlet />
      </main>

      <AccountDialog open={accountDialog} onOpenChange={setAccountDialog} />
    </div>
  );
}
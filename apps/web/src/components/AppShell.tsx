import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  CloudCog,
  Globe,
  History,
  LayoutDashboard,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Server,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AccountSummary, ZoneSummary } from "@dnsit/shared";
import { api, errorMessage } from "@/api/client";
import { useAccounts, useZones } from "@/api/queries";
import { AccountDialog } from "@/components/AccountDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PROVIDER_LABEL } from "@/lib/format";

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
    isActive
      ? "bg-blue-500/10 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300"
      : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
  );
}

function zoneNavClass({ isActive }: { isActive: boolean }) {
  return cn(
    "group flex h-8 items-center gap-2.5 rounded-md px-3 text-xs transition-colors",
    isActive
      ? "bg-blue-500/10 font-medium text-blue-700 dark:bg-blue-400/10 dark:text-blue-300"
      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
  );
}

function Brand() {
  return (
    <Link to="/" className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white shadow-sm shadow-blue-600/20">
        D
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold tracking-tight">DNSIT</span>
        <span className="block truncate text-[10px] text-muted-foreground">多云 DNS 控制台</span>
      </span>
    </Link>
  );
}

function ZoneGroup({ account, zones }: { account: AccountSummary; zones: ZoneSummary[] }) {
  return (
    <div className="space-y-0.5">
      <div className="flex h-7 items-center gap-2 px-3 pt-2">
        <span className="truncate text-[11px] font-medium text-foreground/65">{account.name}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground/65">
          {PROVIDER_LABEL[account.provider] ?? account.provider}
        </span>
        {account.status === "invalid" ? (
          <span className="ml-auto shrink-0 text-[10px] font-medium text-destructive">凭据失效</span>
        ) : null}
      </div>
      {zones.length === 0 ? (
        <p className="px-3 pb-1 text-[11px] text-muted-foreground/55">暂无域名</p>
      ) : (
        zones.map((zone) => (
          <NavLink key={zone.id} to={`/zones/${zone.id}`} className={zoneNavClass} title={zone.name}>
            <Globe className="size-3.5 shrink-0 opacity-65" />
            <span className="truncate">{zone.name}</span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground/55 tabular-nums">{zone.recordCount}</span>
          </NavLink>
        ))
      )}
    </div>
  );
}

function SidebarContent({
  accounts,
  zones,
  accountsLoading,
  syncing,
  zoneQuery,
  onZoneQueryChange,
  onSync,
  onAddAccount,
  onClose,
}: {
  accounts: AccountSummary[];
  zones: ZoneSummary[];
  accountsLoading: boolean;
  syncing: boolean;
  zoneQuery: string;
  onZoneQueryChange: (value: string) => void;
  onSync: () => void;
  onAddAccount: () => void;
  onClose?: () => void;
}) {
  const grouped = useMemo(() => {
    const keyword = zoneQuery.trim().toLowerCase();
    const result = new Map<string, ZoneSummary[]>();
    for (const account of accounts) {
      const accountMatches = account.name.toLowerCase().includes(keyword);
      const matches = zones.filter(
        (zone) =>
          zone.accountId === account.id &&
          (!keyword || accountMatches || zone.name.toLowerCase().includes(keyword)),
      );
      if (matches.length > 0 || (!keyword && account)) result.set(account.id, matches);
    }
    return result;
  }, [accounts, zones, zoneQuery]);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-16 shrink-0 items-center gap-1 border-b border-border/60 px-3">
        <Brand />
        <div className="ml-auto flex items-center">
          <ThemeToggle />
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground"
            onClick={onSync}
            disabled={syncing}
            title="同步全部域名"
            aria-label="同步全部域名"
          >
            <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
          </Button>
          {onClose ? (
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-muted-foreground"
              onClick={onClose}
              aria-label="关闭导航"
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 p-2 pb-1">
        <NavLink to="/" end className={navClass}>
          <LayoutDashboard className="size-4 opacity-75" /> 总览
        </NavLink>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pb-3">
          <div className="flex h-9 items-center px-3 pt-1">
            <span className="text-[10px] font-semibold tracking-wider text-muted-foreground/65">域名解析</span>
            <span className="ml-2 font-mono text-[10px] text-muted-foreground/50">{zones.length}</span>
            <button
              type="button"
              className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={onAddAccount}
              aria-label="添加云账号"
              title="添加云账号"
            >
              <Plus className="size-3.5" />
            </button>
          </div>

          {zones.length > 4 || zoneQuery ? (
            <div className="relative mx-1 mt-1 mb-2">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={zoneQuery}
                onChange={(event) => onZoneQueryChange(event.target.value)}
                placeholder="筛选域名"
                aria-label="筛选侧栏域名"
                className="h-8 border-transparent bg-muted/60 pr-7 pl-8 text-[11px] shadow-none"
              />
              {zoneQuery ? (
                <button
                  type="button"
                  className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => onZoneQueryChange("")}
                  aria-label="清空侧栏域名筛选"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          ) : null}

          {accountsLoading ? (
            <div className="space-y-3 p-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="mx-2 mt-2 rounded-lg border border-dashed px-3 py-5 text-center">
              <p className="text-[11px] leading-5 text-muted-foreground">接入云账号后，域名会显示在这里。</p>
            </div>
          ) : grouped.size === 0 ? (
            <p className="px-3 py-5 text-center text-[11px] text-muted-foreground">没有匹配的域名</p>
          ) : (
            accounts.map((account) =>
              grouped.has(account.id) ? (
                <ZoneGroup key={account.id} account={account} zones={grouped.get(account.id) ?? []} />
              ) : null,
            )
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border/60 p-2">
        <p className="h-7 px-3 pt-1 text-[10px] font-semibold tracking-wider text-muted-foreground/65">管理</p>
        <NavLink to="/accounts" className={navClass}>
          <CloudCog className="size-4 opacity-70" /> 云账号
        </NavLink>
        <NavLink to="/hosts" className={navClass}>
          <Server className="size-4 opacity-70" /> 主机库
        </NavLink>
        <NavLink to="/audit" className={navClass}>
          <History className="size-4 opacity-70" /> 变更记录
        </NavLink>
      </div>
    </div>
  );
}

export function AppShell() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const accounts = useAccounts();
  const zones = useZones();
  const [accountDialog, setAccountDialog] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [zoneQuery, setZoneQuery] = useState("");

  useEffect(() => setMobileOpen(false), [location.pathname]);

  async function syncAll() {
    setSyncing(true);
    try {
      await api.post("/zones/sync");
      await queryClient.invalidateQueries();
      toast.success("全部域名已同步");
    } catch (error) {
      toast.error(errorMessage(error), { duration: 9000 });
    } finally {
      setSyncing(false);
    }
  }

  const sidebarProps = {
    accounts: accounts.data ?? [],
    zones: zones.data ?? [],
    accountsLoading: accounts.isLoading,
    syncing,
    zoneQuery,
    onZoneQueryChange: setZoneQuery,
    onSync: () => void syncAll(),
    onAddAccount: () => setAccountDialog(true),
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="hidden w-60 shrink-0 border-r border-border/70 md:block">
        <SidebarContent {...sidebarProps} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[288px] gap-0 p-0 sm:max-w-xs" showCloseButton={false}>
          <SheetTitle className="sr-only">主导航</SheetTitle>
          <SheetDescription className="sr-only">浏览域名、云账号、主机和变更记录</SheetDescription>
          <SidebarContent {...sidebarProps} onClose={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 md:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="打开导航"
            onClick={() => setMobileOpen(true)}
            className="text-muted-foreground"
          >
            <Menu className="size-5" />
          </Button>
          <Brand />
        </div>
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      <AccountDialog open={accountDialog} onOpenChange={setAccountDialog} />
    </div>
  );
}

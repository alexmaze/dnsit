import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CircleAlert,
  CloudCog,
  Globe,
  History,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import { useAccounts, useHosts, useZones } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { relativeTime, PROVIDER_LABEL } from "@/lib/format";

function MetricCard({
  label,
  value,
  detail,
  icon,
  loading,
  tone = "default",
}: {
  label: string;
  value: number | string;
  detail: ReactNode;
  icon: ReactNode;
  loading?: boolean;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_0_rgb(0_0_0/0.025)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground",
            tone === "warning" && "border-amber-500/20 bg-amber-500/8 text-amber-600 dark:text-amber-400",
          )}
        >
          {icon}
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-1 h-8 w-20" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      )}
      <div className={cn("mt-1.5 text-[11px] text-muted-foreground", tone === "warning" && "text-amber-700 dark:text-amber-400")}>
        {detail}
      </div>
    </div>
  );
}

export function Dashboard() {
  const accounts = useAccounts();
  const zones = useZones();
  const hosts = useHosts();

  const zoneList = zones.data ?? [];
  const accountList = accounts.data ?? [];
  const hostList = hosts.data ?? [];
  const recordCount = zoneList.reduce((sum, zone) => sum + zone.recordCount, 0);
  const driftCount = hostList.reduce((sum, host) => sum + (host.driftCount ?? 0), 0);
  const invalidAccounts = accountList.filter((account) => account.status === "invalid").length;
  const recent = [...zoneList]
    .sort((a, b) => (b.lastSyncedAt ?? "").localeCompare(a.lastSyncedAt ?? ""))
    .slice(0, 7);
  const refreshing = accounts.isFetching || zones.isFetching || hosts.isFetching;

  function refresh() {
    void Promise.all([accounts.refetch(), zones.refetch(), hosts.refetch()]);
  }

  return (
    <div className="h-full overflow-auto bg-muted/20">
      <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        <header className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">总览</h1>
            <p className="mt-1 text-xs text-muted-foreground">统一管理多云域名、解析记录与主机绑定。</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto bg-card shadow-none" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} /> 刷新数据
          </Button>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="资源概览">
          <MetricCard
            label="域名"
            value={zoneList.length}
            detail={`来自 ${accountList.length} 个云账号`}
            icon={<Globe className="size-4" />}
            loading={zones.isLoading}
          />
          <MetricCard
            label="解析记录"
            value={recordCount}
            detail="已同步到本地统一视图"
            icon={<History className="size-4" />}
            loading={zones.isLoading}
          />
          <MetricCard
            label="主机"
            value={hostList.length}
            detail={`${hostList.reduce((sum, host) => sum + host.addresses.length, 0)} 个 IP 地址`}
            icon={<Server className="size-4" />}
            loading={hosts.isLoading}
          />
          <MetricCard
            label="待处理异常"
            value={driftCount + invalidAccounts}
            detail={
              driftCount + invalidAccounts > 0
                ? `${invalidAccounts} 个凭据问题 · ${driftCount} 条 IP 漂移`
                : "账号凭据与主机绑定均正常"
            }
            icon={driftCount + invalidAccounts > 0 ? <CircleAlert className="size-4" /> : <ShieldCheck className="size-4" />}
            loading={accounts.isLoading || hosts.isLoading}
            tone={driftCount + invalidAccounts > 0 ? "warning" : "default"}
          />
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.65fr)]">
          <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.025)]">
            <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">最近同步的域名</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">按最近同步时间排序，点击进入解析详情。</p>
              </div>
              <span className="ml-auto text-[11px] text-muted-foreground">{zoneList.length} 个域名</span>
            </div>

            {zones.isLoading ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : zones.isError ? (
              <div className="px-5 py-12 text-center">
                <CircleAlert className="mx-auto size-6 text-destructive/70" />
                <p className="mt-3 text-sm font-medium">域名列表加载失败</p>
                <p className="mt-1 text-xs text-muted-foreground">请检查服务连接后重试。</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => zones.refetch()}>
                  重新加载
                </Button>
              </div>
            ) : recent.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Globe className="size-5" />
                </div>
                <p className="mt-4 text-sm font-semibold">还没有同步任何域名</p>
                <p className="mt-1.5 text-xs text-muted-foreground">先接入云账号，再同步域名与解析记录。</p>
                <Button asChild size="sm" className="mt-5 bg-blue-600 text-white hover:bg-blue-700">
                  <Link to="/accounts">接入云账号 <ArrowRight className="size-3.5" /></Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/55">
                {recent.map((zone) => (
                  <Link
                    key={zone.id}
                    to={`/zones/${zone.id}`}
                    className="group flex min-w-0 items-center gap-3 px-5 py-3.5 transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-blue-500/15 bg-blue-500/8 text-blue-600 dark:text-blue-400">
                      <Globe className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[13px] font-semibold group-hover:text-blue-700 dark:group-hover:text-blue-300">{zone.name}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground/70">{PROVIDER_LABEL[zone.provider] ?? zone.provider}</span>
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-muted-foreground">{zone.accountName}</span>
                    </span>
                    <span className="hidden shrink-0 text-right sm:block">
                      <span className="block text-[11px] font-medium text-foreground/70">{zone.recordCount} 条记录</span>
                      <span className="mt-1 block text-[10px] text-muted-foreground">{relativeTime(zone.lastSyncedAt)}</span>
                    </span>
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <section className="rounded-xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_0_rgb(0_0_0/0.025)]">
              <h2 className="text-sm font-semibold">运行状态</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">需要关注的问题会优先显示。</p>
              <div className="mt-4 space-y-4">
                <Link to="/accounts" className="group flex items-start gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                  <span className={cn("mt-0.5 flex size-7 items-center justify-center rounded-lg", invalidAccounts ? "bg-destructive/8 text-destructive" : "bg-muted text-muted-foreground")}>
                    <CloudCog className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium">云账号连接</span>
                    <span className={cn("mt-1 block text-[11px] text-muted-foreground", invalidAccounts && "text-destructive")}>
                      {invalidAccounts ? `${invalidAccounts} 个账号凭据失效` : `${accountList.length} 个账号连接正常`}
                    </span>
                  </span>
                  <ArrowRight className="mt-1 size-3.5 text-muted-foreground/40 group-hover:text-foreground" />
                </Link>

                <Link to="/hosts" className="group flex items-start gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                  <span className={cn("mt-0.5 flex size-7 items-center justify-center rounded-lg", driftCount ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground")}>
                    <Server className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium">主机记录一致性</span>
                    <span className={cn("mt-1 block text-[11px] text-muted-foreground", driftCount && "text-amber-600 dark:text-amber-400")}>
                      {driftCount ? `${driftCount} 条记录与主机 IP 不一致` : "绑定记录与主机 IP 一致"}
                    </span>
                  </span>
                  <ArrowRight className="mt-1 size-3.5 text-muted-foreground/40 group-hover:text-foreground" />
                </Link>

                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <RefreshCw className="size-3.5" />
                  </span>
                  <div>
                    <p className="text-xs font-medium">最近同步</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{recent[0] ? relativeTime(recent[0].lastSyncedAt) : "暂无同步记录"}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-blue-500/15 bg-blue-500/[0.035] p-5">
              <h2 className="text-sm font-semibold">从解析到主机，保持一致</h2>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                将 A/AAAA 记录绑定到主机后，主机换 IP 时可以批量同步所有关联记录。
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4 bg-card shadow-none">
                <Link to="/hosts">管理主机库 <ArrowRight className="size-3.5" /></Link>
              </Button>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

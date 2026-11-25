import { Link } from "react-router-dom";
import { Globe, Server, ArrowRight, RefreshCw } from "lucide-react";
import { useAccounts, useHosts, useZones } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime, PROVIDER_LABEL } from "@/lib/format";

export function Dashboard() {
  const accounts = useAccounts();
  const zones = useZones();
  const hosts = useHosts();

  const zoneList = zones.data ?? [];
  const accountList = accounts.data ?? [];
  const hostList = hosts.data ?? [];
  const driftCount = hostList.reduce((sum, host) => sum + (host.driftCount ?? 0), 0);
  const recent = [...zoneList].sort((a, b) => (b.lastSyncedAt ?? "").localeCompare(a.lastSyncedAt ?? "")).slice(0, 8);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">总览</h1>
          <p className="text-sm text-muted-foreground">
            一个界面管理阿里云与腾讯云上的全部域名，A 记录可以直接挂到主机库里的机器。
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Globe className="size-3.5" /> 域名
              </CardDescription>
              <CardTitle className="text-3xl">{zones.isLoading ? "—" : zoneList.length}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              来自 {accountList.length} 个云账号
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Server className="size-3.5" /> 主机
              </CardDescription>
              <CardTitle className="text-3xl">{hosts.isLoading ? "—" : hostList.length}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {driftCount > 0 ? (
                <span className="text-amber-500">{driftCount} 条记录与主机 IP 不一致</span>
              ) : (
                "所有绑定记录与主机 IP 一致"
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>缓存状态</CardDescription>
              <CardTitle className="text-3xl">
                {zones.data ? (`${zoneList.length ? "正常" : "空"}`) : "—"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              <Button
                variant="link"
                className="h-auto p-0 text-xs"
                onClick={() => zones.refetch()}
              >
                <RefreshCw className="size-3" /> 刷新域名列表
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近同步的域名</CardTitle>
            <CardDescription>点进去查看解析树与记录</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {zones.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                还没有接入任何域名，先在左侧「添加云账号」。
              </p>
            ) : (
              recent.map((zone) => (
                <Link
                  key={zone.id}
                  to={`/zones/${zone.id}`}
                  className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent/60"
                >
                  <Globe className="size-3.5 text-muted-foreground" />
                  <span className="font-medium">{zone.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {PROVIDER_LABEL[zone.provider] ?? zone.provider}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{zone.accountName}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {zone.recordCount} 条 · {relativeTime(zone.lastSyncedAt)}
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

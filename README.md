# dnsit

一个只在自己机器上跑的多云域名与解析管理台：把阿里云、腾讯云的域名放在同一个界面里管，支持树形查看 CNAME 关系，并把 A/AAAA 记录直接绑定到「主机库」里的机器。

```
pnpm setup     # 安装依赖 + 构建 shared
pnpm dev       # 后端 :8787 + 前端 :5173
```

打开 http://127.0.0.1:5173 → 左侧「添加云账号」→ 录入主机 → 开始管解析。

生产形态：`pnpm build && pnpm start`，单进程 `http://127.0.0.1:8787` 同时托管前端与 API。

## 它能做什么

**多云统一管理**
- 一个界面列出阿里云（云解析 DNS）与腾讯云（DNSPod）的全部域名，标明归属账号
- 同一家云可接入多个 AK/SK（主账号、子账号、不同主体）
- 记录支持增、改、删、启用/停用，改动会同步到云厂商

**树形解析视图**
- 按主机记录（RR）成树，CNAME 记录挂到它指向的那条记录下面
- 跨域名目标显示为「外部目标」，若目标域名也已接入，一键跳转
- 目标不存在的 CNAME 标红「未挂载」；循环引用、目标已停用、同一 RR 多线路指向不同目标都有独立标记
- 表格视图与树视图共享同一份数据和筛选条件

**主机库**
- 录入主机名 + 多个 IP（公网/内网、IPv4/IPv6），支持标签、备注、批量粘贴导入
- 配置 A/AAAA 记录时直接从主机库选择，自动填 IP 并解除手写
- 主机详情页反向列出「哪些域名的哪些记录指向这台机器」
- 有人在云控制台手改了已绑定的 IP，刷新后标记为「值不一致」
- 改主机 IP 时先预览受影响的 N 条记录，确认后逐条更新并逐条回显失败

**安全与可追溯**
- AK/SK 用 AES-256-GCM 加密后入库，接口与页面都不回显 Secret
- 只监听 127.0.0.1；写请求要求 `x-dnsit-client` 头并校验 Origin
- 所有写操作落审计（before/after 快照 + 厂商 requestId），「变更记录」页可查
- 账号可标记只读；另有全局只读开关 `DNSIT_READONLY=1`

## 需要你准备的

到阿里云 RAM / 腾讯云 CAM 建**子账号**，只授 DNS 权限：

| 云 | 建议策略 |
|---|---|
| 阿里云 | `AliyunDNSFullAccess`（或收窄到指定域名） |
| 腾讯云 | `QcloudDNSPodFullAccess`（或收窄到指定域名） |

策略名以控制台当前显示为准。**不要用主账号 AK**，也不要把 AK 提交进仓库。

## 使用要点

### 树视图怎么读

节点是「主机记录」，不是单条记录。`api` 节点下可以同时有 A、MX、TXT；指向 `api.example.com` 的 CNAME 会作为子节点挂上来。

- `未挂载`：CNAME 目标在本域名内不存在（多半是目标记录被删了）
- `外部目标`：目标在别的域名，若该域名已接入则可跳转
- `循环引用`：a → b → a 这类环，界面不会崩
- `多目标`：同一条 RR 的多条 CNAME（按线路区分）指向了不同目标，源节点会在多个父节点下各出现一次

### 绑定主机与漂移

A/AAAA 记录在编辑弹窗里点「选择主机」即可绑定，记录值由主机 IP 决定，不需要手打。

绑定关系单独存表，不随记录缓存刷新丢失。三种情况会被标记为漂移：

| 标记 | 含义 |
|---|---|
| 值不一致 | 记录的 IP 被别处改了，与主机当前 IP 不同 |
| 记录已删除 | 绑定过，但云端记录已经不存在 |

**不会**根据 IP 自动绑定历史记录（共享 IP、CDN 场景会误绑），只在输入框下方给「这个 IP 属于主机 X」的建议。

### 改主机 IP

主机详情 → 地址行「改 IP 并同步」→ 输入新 IP → 预览 → 执行。

严格逐条更新：失败的记录会列出原因（含厂商错误码），可修好后重试。只有全部成功才会更新主机地址本身，避免主机信息与实际解析脱节。

## 配置

复制 `.env.example` 为 `.env`（可选，默认值即可跑）。常用项：

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 8787 | 服务端口 |
| `DATABASE_URL` | `file:./data/dnsit.db` | 相对路径按 `apps/api` 解析 |
| `DNSIT_MASTER_KEY` | 自动生成 | 32 字节 base64 或 64 位 hex |
| `DNSIT_READONLY` | 0 | 1 = 全实例只读 |
| `ALIYUN_QPS` / `TENCENT_QPS` | 5 / 10 | 每账号串行节流 |
| `RECORD_CACHE_TTL` | 120 | 记录缓存秒数 |

数据都在 `apps/api/data/`：`dnsit.db`（SQLite）与 `master.key`（主密钥）。**备份时两者都要**，缺一不可解密。

## 部署（Caddy + Docker）

线上地址：**https://dnsit-sg.refme.cc** —— Caddy 负责 TLS 与 basic_auth，反向代理到容器；容器只挂在 `dapps_default` network 上，不映射宿主机端口。

### 1. 构建

```bash
pnpm install && pnpm build
```

### 2. 起容器

```bash
docker compose up -d
```

容器名 `dnsit`，以只读方式挂载本仓库（`/app:ro`），数据放在命名卷 `dnsit_dnsit-data`，健康检查打 `/api/health`。因为不 publish 端口，172.18.0.x 之外无法直连，唯一入口是 Caddy。

### 3. 反向代理

在 `/home/alex/sg/dapps/data/caddy/etc/Caddyfile` 追加：

```caddy
dnsit-sg.refme.cc {
    encode zstd gzip

    basic_auth {
        alex <bcrypt-hash>
    }

    reverse_proxy dnsit:8787 {
        header_up -Authorization
        header_up X-Real-IP {remote_host}
    }
}
```

`header_up -Authorization` 会在转发前剥掉 basic_auth 的凭据，避免把口令带给应用。

```bash
docker exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

### 4. 更新

代码是只读挂载，改完重新构建即可，不需要重建镜像：

```bash
pnpm build && docker compose restart dnsit
```

### 5. 备份

`master.key` 与 `dnsit.db` 必须一起备份，缺一则 AK/SK 不可解：

```bash
docker run --rm -v dnsit_dnsit-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/dnsit-data.tgz -C /data .
```

### 部署相关的环境变量

| 变量 | 容器内取值 | 说明 |
|---|---|---|
| `HOST` | `0.0.0.0` | 容器内必须监听全网卡，由 network 隔离 |
| `DNSIT_ALLOWED_ORIGINS` | `https://dnsit-sg.refme.cc` | 写请求 Origin 白名单，缺了会 403 |

## 项目结构

```
apps/api          Hono 服务：账号、域名同步、记录读写、主机库、审计
  src/providers   Provider 适配层（aliyun / tencent），错误码归一化
  src/services    业务编排：sync / records / hosts / links / rollout
  src/repo.ts     node:sqlite 仓储层
apps/web          React 19 + Vite + Tailwind 4 + shadcn/ui
packages/shared   前后端共用：类型、zod 校验、IP 规范化、CNAME 树、字段 diff
```

## 测试

```
pnpm typecheck    # 三个包 tsc --noEmit
pnpm test         # shared 单测 + api 接口测试 + web DOM 渲染测试
pnpm build        # shared → api → web
```

- `shared`：IPv4/IPv6 规范化、CNAME 树（悬空/跨域/环/多线路）、字段 diff
- `api`：`app.request()` + 内存 SQLite，覆盖 CSRF 守卫、主机 CRUD、导入预览、删除保护、404
- `web`：jsdom 真实渲染，覆盖总览页与「树视图挂载 + 未挂载标记」

不做真实云端集成测试（会污染真实解析，也受限于限频与费用），云端联调以人工验收为主。

## 与最初计划的偏离

| 计划 | 实际 | 原因 |
|---|---|---|
| Prisma 7 + better-sqlite3 | Node 内置 `node:sqlite` + 手写仓储 | 当前环境没有 `make`/`gcc`，原生模块无法编译；`node:sqlite` 零依赖、无需 codegen |
| shadcn 默认风格 | `new-york`（Radix） | 默认的 `base-nova` 基于 Base UI，不支持 `asChild` 组合写法 |
| IP 校验用 `node:net` | 纯 JS 校验器 | `shared` 会被前端打包，不能引入 Node 内置模块 |

## 已知限制

- 只支持阿里云与腾讯云两家；接第三家需实现 `apps/api/src/providers/contract.ts` 的 `DnsProvider`
- 阿里云没有批量接口，因此「改主机 IP」是逐条执行，非原子
- 记录是云端数据的缓存，默认 2 分钟后过期；页面上的「刷新」会强制回源
- `node:sqlite` 在 Node 24 上仍会打印 ExperimentalWarning，不影响功能
- 不做域名注册/续费/实名信息，不做主机探活（不 ping、不扫端口）
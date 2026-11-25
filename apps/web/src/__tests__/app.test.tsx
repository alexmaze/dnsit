import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { describe, expect, it, vi } from "vitest";
import App from "@/App";

const zone = {
  id: "z1",
  accountId: "a1",
  accountName: "阿里-主站",
  provider: "aliyun",
  name: "example.com",
  recordCount: 3,
  lastSyncedAt: new Date().toISOString(),
};

const records = {
  zoneName: "example.com",
  syncedAt: new Date().toISOString(),
  records: [
    {
      id: "z1:1",
      zoneId: "z1",
      remoteId: "1",
      name: "api",
      fqdn: "api.example.com",
      type: "A",
      value: "1.2.3.4",
      ttl: 600,
      line: { code: "default", label: "默认" },
      status: "ENABLE",
      remark: "主站后端",
    },
    {
      id: "z1:2",
      zoneId: "z1",
      remoteId: "2",
      name: "blog",
      fqdn: "blog.example.com",
      type: "CNAME",
      value: "gone.example.com",
      ttl: 600,
      line: { code: "default", label: "默认" },
      status: "ENABLE",
    },
    {
      id: "z1:3",
      zoneId: "z1",
      remoteId: "3",
      name: "www",
      fqdn: "www.example.com",
      type: "CNAME",
      value: "api.example.com",
      ttl: 600,
      line: { code: "default", label: "默认" },
      status: "ENABLE",
    },
  ],
};

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (data: unknown) =>
        new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/accounts"))
        return json([
          {
            id: "a1",
            provider: "aliyun",
            name: "阿里-主站",
            accessKeyMasked: "LTAI****3f9c",
            readonly: false,
            status: "ok",
            lastVerifiedAt: new Date().toISOString(),
            zoneCount: 1,
          },
        ]);
      if (url.includes("/records")) return json(records);
      if (url.includes("/zones")) return json([zone]);
      if (url.includes("/hosts")) return json([]);
      if (url.includes("/audit")) return json({ items: [], total: 0 });
      return json([]);
    }),
  );
}

function renderApp(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("web app", () => {
  it("renders the dashboard shell", async () => {
    stubFetch();
    renderApp("/");
    await waitFor(() => expect(screen.getByText("总览")).toBeTruthy());
    expect(screen.getByText("dnsit")).toBeTruthy();
    expect(screen.getByLabelText("切换主题")).toBeTruthy();
  });

  it("lists cloud accounts with edit and delete actions", async () => {
    stubFetch();
    renderApp("/accounts");
    // 账号名同时出现在侧栏与表格里
    await waitFor(() => expect(screen.getAllByText("阿里-主站").length).toBeGreaterThan(0));
    expect(screen.getAllByText("编辑").length).toBeGreaterThan(0);
    expect(screen.getAllByText("删除").length).toBeGreaterThan(0);
    expect(screen.getByText("LTAI****3f9c")).toBeTruthy();
  });

  it("offers ip matching on the hosts page", async () => {
    stubFetch();
    renderApp("/hosts");
    await waitFor(() => expect(screen.getByText("按 IP 匹配")).toBeTruthy());
    expect(screen.getByText("批量导入")).toBeTruthy();
  });

  it("mounts a cname under its target and flags dangling targets", async () => {
    stubFetch();
    renderApp("/zones/z1");
    await waitFor(() => expect(screen.getByRole("heading", { name: "example.com" })).toBeTruthy());
    // 悬空目标提示
    await waitFor(() => expect(screen.getAllByText("未挂载").length).toBeGreaterThan(0));
    // CNAME 目标节点存在
    expect(screen.getAllByText("api").length).toBeGreaterThan(0);
    expect(screen.getAllByText("www").length).toBeGreaterThan(0);
    // 云端备注被展示出来
    expect(screen.getAllByText("主站后端").length).toBeGreaterThan(0);
  });
});
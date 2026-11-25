import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function stubFetch(recordPayload = records) {
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
      if (url.includes("/records")) return json(recordPayload);
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
    await waitFor(() => expect(screen.getByRole("heading", { name: "总览" })).toBeTruthy());
    expect(screen.getAllByText("DNSIT").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("切换主题")).toBeTruthy();
  });

  it("opens and closes the mobile navigation sheet", async () => {
    stubFetch();
    renderApp("/");
    const trigger = await screen.findByRole("button", { name: "打开导航" });
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "主导航" });
    expect(within(dialog).getByText("域名解析")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭导航" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "主导航" })).toBeNull());
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

  it("filters cloud accounts and restores the list", async () => {
    stubFetch();
    renderApp("/accounts");
    const search = await screen.findByLabelText("搜索云账号");
    await screen.findByText("LTAI****3f9c");

    fireEvent.change(search, { target: { value: "not-found" } });
    await screen.findByText("没有找到匹配的云账号");
    fireEvent.click(screen.getAllByRole("button", { name: "清除筛选" })[0]);
    await waitFor(() => expect(screen.getByText("LTAI****3f9c")).toBeTruthy());
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

  it("collapses and expands all CNAME branches together", async () => {
    stubFetch();
    renderApp("/zones/z1");
    await screen.findByText("www");

    fireEvent.click(screen.getByRole("button", { name: "收起全部" }));
    expect(screen.queryByText("www")).toBeNull();
    expect(screen.queryByText("blog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "展开全部" }));
    await waitFor(() => expect(screen.getByText("www")).toBeTruthy());
    expect(screen.getByText("blog")).toBeTruthy();
  });

  it("sorts and searches records in the table view", async () => {
    stubFetch();
    renderApp("/zones/z1?view=table");
    const table = await screen.findByRole("table", { name: "解析记录列表" });
    await within(table).findByText("api");

    const firstDataRow = () => within(table).getAllByRole("row")[1];
    const nameHeader = within(table).getAllByRole("columnheader")[0];
    expect(within(firstDataRow()).getByText("api")).toBeTruthy();
    expect(nameHeader.getAttribute("aria-sort")).toBe("ascending");

    fireEvent.click(screen.getByRole("button", { name: "按主机记录排序" }));
    expect(within(firstDataRow()).getByText("www")).toBeTruthy();
    expect(nameHeader.getAttribute("aria-sort")).toBe("descending");

    fireEvent.change(screen.getByLabelText("搜索解析记录"), { target: { value: "api" } });
    await waitFor(() => expect(within(table).queryByText("blog.example.com")).toBeNull());
    expect(within(table).getAllByText("api.example.com").length).toBeGreaterThan(0);
  });

  it("keeps real CNAME targets as context without inventing dangling nodes", async () => {
    stubFetch();
    renderApp("/zones/z1");
    await screen.findByText("www");

    fireEvent.change(screen.getByLabelText("搜索解析记录"), { target: { value: "www" } });
    await waitFor(() => expect(screen.queryByText("未挂载")).toBeNull());
    expect(screen.getByText("www")).toBeTruthy();
    expect(screen.getByText("当前筛选隐藏了 1 条目标记录，完整解析关系仍保留。")).toBeTruthy();
    expect(screen.queryByText("gone.example.com")).toBeNull();
  });

  it("expands cyclic chains and stops only at the repeated back edge", async () => {
    const template = records.records[2];
    stubFetch({
      ...records,
      records: [
        { ...template, id: "z1:a", remoteId: "a", name: "a", fqdn: "a.example.com", value: "b.example.com", remark: "keep" },
        { ...template, id: "z1:b", remoteId: "b", name: "b", fqdn: "b.example.com", value: "a.example.com" },
      ],
    });
    renderApp("/zones/z1");
    const expand = await screen.findByRole("button", { name: "展开全部" });
    fireEvent.click(expand);

    await waitFor(() => expect(screen.getAllByText("a").length).toBe(2));
    expect(screen.getAllByText("b").length).toBe(1);
    expect(screen.getAllByText("循环引用").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("搜索解析记录"), { target: { value: "keep" } });
    await waitFor(() => expect(screen.getAllByText("a").length).toBe(2));
    expect(screen.getAllByText("b").length).toBe(1);
  });

  it("keeps only the matching branch when a node has multiple CNAME targets", async () => {
    const target = records.records[0];
    const cname = records.records[2];
    stubFetch({
      ...records,
      records: [
        { ...target, id: "z1:ta", remoteId: "ta", name: "a", fqdn: "a.example.com", remark: "" },
        { ...target, id: "z1:tb", remoteId: "tb", name: "b", fqdn: "b.example.com", remark: "" },
        { ...cname, id: "z1:r1", remoteId: "r1", name: "edge", fqdn: "edge.example.com", value: "a.example.com", remark: "keep" },
        { ...cname, id: "z1:r2", remoteId: "r2", name: "edge", fqdn: "edge.example.com", value: "b.example.com", remark: "drop" },
      ],
    });
    renderApp("/zones/z1");
    const search = await screen.findByLabelText("搜索解析记录");
    fireEvent.change(search, { target: { value: "keep" } });

    await waitFor(() => expect(screen.getAllByText("edge").length).toBe(1));
    expect(screen.getByText("a")).toBeTruthy();
    expect(screen.queryByText("b")).toBeNull();
    expect(screen.queryByText("b.example.com")).toBeNull();
  });
});
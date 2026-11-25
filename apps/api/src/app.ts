import fs from "node:fs";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import type { AppContext } from "./context.js";
import { HttpError, toErrorBody } from "./errors.js";
import { apiRoutes } from "./http/routes.js";

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function createApp(ctx: AppContext): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    const isWrite = WRITE_METHODS.has(c.req.method);
    if (isWrite) {
      if (c.req.header("x-dnsit-client") !== "web") {
        return c.json(
          { error: { code: "CSRF_BLOCKED", message: "缺少 x-dnsit-client 头，请求被拒绝" } },
          403,
        );
      }
      if (origin && !ctx.config.allowedOrigins.includes(origin)) {
        return c.json({ error: { code: "ORIGIN_BLOCKED", message: `来源不被允许：${origin}` } }, 403);
      }
    }
    await next();
  });

  app.route("/api", apiRoutes(ctx));

  if (fs.existsSync(ctx.config.webDist)) {
    app.use("/*", serveStatic({ root: ctx.config.webDist }));
    app.get("*", async (c) => {
      if (c.req.path.startsWith("/api")) {
        return c.json({ error: { code: "NOT_FOUND", message: `未找到接口：${c.req.path}` } }, 404);
      }
      const html = fs.readFileSync(path.join(ctx.config.webDist, "index.html"), "utf8");
      return c.html(html);
    });
  } else {
    app.get("/", (c) => c.text("dnsit api 已启动；前端请运行 pnpm dev 或先执行 pnpm build"));
  }

  app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: `未找到路由：${c.req.path}` } }, 404));

  app.onError((error, c) => {
    const { status, body } = toErrorBody(error);
    if (status >= 500) console.error("[dnsit]", error);
    return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502);
  });

  return app;
}

export { HttpError };

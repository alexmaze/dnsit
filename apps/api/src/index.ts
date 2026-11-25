import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import type { AppContext } from "./context.js";
import { SecretBox } from "./crypto.js";
import { openDatabase } from "./db.js";
import { loadConfig } from "./env.js";

function main(): void {
  const config = loadConfig();
  const db = openDatabase(config.dbFile);
  const { box, created } = SecretBox.load(config.masterKey, config.dataDir);

  const ctx: AppContext = { db, config, box };
  const app = createApp(ctx);

  fs.mkdirSync(config.dataDir, { recursive: true });

  serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
    console.log(`\ndnsit api  →  http://${config.host}:${info.port}`);
    console.log(`数据库      →  ${config.dbFile}`);
    if (created) {
      console.log("主密钥      →  已生成 data/master.key（0600），请务必备份；丢失后需重新录入 AK/SK");
    }
    console.log(`只读模式    →  ${config.readOnly ? "开启" : "关闭"}`);
    if (!fs.existsSync(path.join(config.webDist, "index.html"))) {
      console.log("前端产物    →  未找到 apps/web/dist，开发时请配合 pnpm dev 使用 5173");
    }
  });
}

main();

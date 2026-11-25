import path from "node:path";

export const PKG_ROOT = path.resolve(import.meta.dirname, "..");

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface AppConfig {
  port: number;
  host: string;
  dbFile: string;
  dataDir: string;
  masterKey: string | undefined;
  aliyunQps: number;
  tencentQps: number;
  recordCacheTtl: number;
  zoneCacheTtl: number;
  readOnly: boolean;
  allowedOrigins: string[];
  webDist: string;
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(): AppConfig {
  const dataDir = path.join(PKG_ROOT, "data");
  const rawDb = process.env.DATABASE_URL ?? `file:${path.join(dataDir, "dnsit.db")}`;
  const dbFile = rawDb.startsWith("file:") ? rawDb.slice("file:".length) : rawDb;
  const port = num(process.env.PORT, 8787);
  const host = process.env.HOST?.trim() || "127.0.0.1";
  return {
    port,
    host,
    dbFile: path.isAbsolute(dbFile) ? dbFile : path.resolve(PKG_ROOT, dbFile),
    dataDir,
    masterKey: process.env.DNSIT_MASTER_KEY,
    aliyunQps: num(process.env.ALIYUN_QPS, 5),
    tencentQps: num(process.env.TENCENT_QPS, 10),
    recordCacheTtl: num(process.env.RECORD_CACHE_TTL, 120),
    zoneCacheTtl: num(process.env.ZONE_CACHE_TTL, 300),
    readOnly: process.env.DNSIT_READONLY === "1",
    allowedOrigins: [
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
      "http://127.0.0.1:5173",
      "http://localhost:5173",
      ...list(process.env.DNSIT_ALLOWED_ORIGINS),
    ],
    webDist: path.resolve(PKG_ROOT, "../web/dist"),
  };
}
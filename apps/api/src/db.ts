import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  access_key_id TEXT NOT NULL,
  secret_cipher TEXT NOT NULL,
  secret_iv TEXT NOT NULL,
  secret_tag TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  is_readonly INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unverified',
  last_verified_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, name)
);

CREATE TABLE IF NOT EXISTS zones (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  remote_zone_id TEXT,
  record_count INTEGER NOT NULL DEFAULT 0,
  grade_title TEXT,
  vip_end_at TEXT,
  status TEXT,
  default_ttl INTEGER,
  last_synced_at TEXT,
  UNIQUE(account_id, name)
);
CREATE INDEX IF NOT EXISTS idx_zones_name ON zones(name);

CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  remote_record_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  ttl INTEGER NOT NULL,
  line TEXT,
  line_id TEXT,
  priority INTEGER,
  weight INTEGER,
  status TEXT NOT NULL,
  remark TEXT,
  remote_updated_at TEXT,
  synced_at TEXT NOT NULL,
  UNIQUE(zone_id, remote_record_id)
);
CREATE INDEX IF NOT EXISTS idx_records_zone_name ON records(zone_id, name);
CREATE INDEX IF NOT EXISTS idx_records_value ON records(value);

CREATE TABLE IF NOT EXISTS hosts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL UNIQUE,
  remark TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS host_addresses (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  ip TEXT NOT NULL,
  version INTEGER NOT NULL,
  scope TEXT NOT NULL DEFAULT 'PUBLIC',
  is_primary INTEGER NOT NULL DEFAULT 0,
  UNIQUE(host_id, ip)
);
CREATE INDEX IF NOT EXISTS idx_host_addresses_ip ON host_addresses(ip);

CREATE TABLE IF NOT EXISTS record_host_links (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL,
  remote_record_id TEXT NOT NULL,
  host_address_id TEXT NOT NULL REFERENCES host_addresses(id) ON DELETE CASCADE,
  drift TEXT NOT NULL DEFAULT 'NONE',
  created_at TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  UNIQUE(zone_id, remote_record_id)
);
CREATE INDEX IF NOT EXISTS idx_links_address ON record_host_links(host_address_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  zone_id TEXT,
  zone_name TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  result TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_zone ON audit_logs(zone_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
  },
];

export type Db = DatabaseSync;

export function openDatabase(file: string): Db {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const current = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version ?? 0);
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function bool(value: unknown): boolean {
  return value === 1 || value === true;
}

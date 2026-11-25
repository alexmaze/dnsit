import type { AppConfig } from "./env.js";
import type { SecretBox } from "./crypto.js";
import type { Db } from "./db.js";

export interface AppContext {
  db: Db;
  config: AppConfig;
  box: SecretBox;
}

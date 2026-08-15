import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const file = process.env.LOCAL_DB_PATH || join(process.cwd(), "data", "githubfolio.local.sqlite");
let db: DatabaseSync | null = null;

export function getLocalStore() {
  if (!db) {
    mkdirSync(dirname(file), { recursive: true });
    db = new DatabaseSync(file);
    db.exec("CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
  }
  return db;
}

export function localStoreStatus() {
  return { enabled: !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY, path: file };
}

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
type DatabaseSync = import("node:sqlite").DatabaseSync;
const DatabaseSyncCtor = (process as NodeJS.Process & { getBuiltinModule?: (name: string) => unknown }).getBuiltinModule?.("node:sqlite") as { DatabaseSync: new (path: string, options?: { timeout?: number }) => DatabaseSync } | undefined;

const file = process.env.LOCAL_DB_PATH || join(process.cwd(), "data", "githubfolio.local.sqlite");
let db: DatabaseSync | null = null;

export function getLocalStore() {
  if (!db) {
    mkdirSync(dirname(file), { recursive: true });
    if (!DatabaseSyncCtor) throw new Error("node:sqlite is unavailable in this runtime");
    db = new DatabaseSyncCtor.DatabaseSync(file, { timeout: 5_000 });
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
  }
  return db;
}

export function localStoreStatus() {
  return { enabled: !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY, path: file };
}

export function localGet<T>(key: string, fallback: T): T {
  const row = getLocalStore().prepare("SELECT value FROM app_state WHERE key = ?").get(key) as { value?: string } | undefined;
  if (!row?.value) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}

export function localSet<T>(key: string, value: T) {
  getLocalStore().prepare("INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(key, JSON.stringify(value));
}

export function localDelete(key: string) {
  getLocalStore().prepare("DELETE FROM app_state WHERE key = ?").run(key);
}

export function localDeleteByPrefix(prefix: string) {
  getLocalStore().prepare("DELETE FROM app_state WHERE key LIKE ?").run(`${prefix}%`);
}

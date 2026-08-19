import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

export function getSupabaseSql() {
  const connectionString = process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is required for Supabase Postgres persistence.");
  if (!sql) sql = postgres(connectionString, { max: 5, idle_timeout: 20, connect_timeout: 10, prepare: false });
  return sql;
}

import postgres from "postgres";
import { describe, expect, it } from "vitest";

describe("Supabase Postgres connection", () => {
  it("connects to the configured Supabase database", async () => {
    const connectionString = process.env.SUPABASE_DATABASE_URL;
    expect(connectionString).toMatch(/^postgres(?:ql)?:\/\//);
    const sql = postgres(connectionString!, { max: 1, connect_timeout: 10, idle_timeout: 1 });
    try {
      const result = await sql<{ database_name: string }[]>`select current_database() as database_name`;
      expect(result[0]?.database_name).toBeTruthy();
    } finally {
      await sql.end({ timeout: 2 });
    }
  }, 15_000);
});

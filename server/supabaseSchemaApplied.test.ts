import { describe, expect, it } from "vitest";
import { getSupabaseSql } from "./supabaseDb";

describe("Supabase Postgres schema", () => {
  it("contains the core GitFolio application tables after migrations are applied", async () => {
    const sql = getSupabaseSql();
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in ('users', 'profiles', 'githubConnections', 'repositories', 'subscriptions', 'webhookDeliveries')
    `;
    expect(new Set(rows.map((row) => row.table_name))).toEqual(new Set(["users", "profiles", "githubConnections", "repositories", "subscriptions", "webhookDeliveries"]));
  }, 15_000);
});

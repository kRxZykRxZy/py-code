import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Supabase Postgres migration", () => {
  it("defines the core GitFolio persistence tables without legacy platform storage paths", async () => {
    const migration = await readFile(join(process.cwd(), "supabase/migrations/20260819100300_create_gitfolio_core.sql"), "utf8");
    for (const table of ["users", "profiles", "githubConnections", "repositories", "customDomains", "contactMessages", "newsletterSubscriptions", "analyticsEvents", "subscriptions", "webhookDeliveries"]) {
      expect(migration).toContain(`create table if not exists public.${table === "users" || table === "profiles" || table === "repositories" || table === "subscriptions" ? table : `"${table}"`}`);
    }
    expect(migration.toLowerCase()).not.toContain("legacy-platform");
  });
});

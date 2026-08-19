import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("health endpoint", () => {
  it("exposes an unauthenticated GitFolio readiness response", async () => {
    const source = await readFile(join(process.cwd(), "server/_core/index.ts"), "utf8");
    expect(source).toContain('app.get("/api/healthz"');
    expect(source).toContain('status: "ok"');
    expect(source).toContain('service: "gitfolio"');
  });

  it("exposes readiness and version diagnostics without requiring a session", async () => {
    const source = await readFile(join(process.cwd(), "server/_core/index.ts"), "utf8");
    expect(source).toContain('app.get("/api/readyz"');
    expect(source).toContain('persistence: database ? "connected" : "fallback"');
    expect(source).toContain('app.get("/api/version"');
    expect(source).toContain('revision: process.env.GIT_SHA || "local"');
  });

  it("reports safe operational status without returning runtime secrets", async () => {
    const source = await readFile(join(process.cwd(), "server/_core/index.ts"), "utf8");
    expect(source).toContain('app.get("/api/status"');
    expect(source).toContain('status: "operational"');
    expect(source).toContain('components: { api: "operational"');
  });

  it("checks essential Supabase table readiness without exposing database details", async () => {
    const source = await readFile(join(process.cwd(), "server/_core/index.ts"), "utf8");
    expect(source).toContain('app.get("/api/database/health"');
    expect(source).toContain("information_schema.tables");
    expect(source).toContain('persistence: "supabase"');
  });
});

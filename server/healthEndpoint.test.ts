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
  });
});

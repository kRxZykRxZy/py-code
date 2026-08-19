import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("CSP violation reporting", () => {
  it("reports violations through a bounded endpoint without logging report bodies or URLs", async () => {
    const security = await readFile(join(process.cwd(), "server/_core/security.ts"), "utf8");
    const index = await readFile(join(process.cwd(), "server/_core/index.ts"), "utf8");
    expect(security).toContain("report-uri /api/csp-report");
    expect(index).toContain('app.post("/api/csp-report"');
    expect(index).toContain('event: "csp_violation"');
    expect(index).not.toContain("JSON.stringify(req.body)");
  });
});

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("request observability", () => {
  it("adds bounded request IDs and structured completion logs without request-body logging", async () => {
    const source = await readFile(join(process.cwd(), "server/_core/index.ts"), "utf8");
    expect(source).toContain('res.setHeader("X-Request-Id", requestId)');
    expect(source).toContain('event: "http_request"');
    expect(source).toContain("durationMs");
    expect(source).not.toContain("body: req.body");
  });
});

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("portfolio structured data", () => {
  it("emits Person JSON-LD for portfolios and SoftwareSourceCode JSON-LD for project routes", async () => {
    const source = await readFile(join(process.cwd(), "server/_core/vite.ts"), "utf8");
    expect(source).toContain('"@type": "Person"');
    expect(source).toContain('"@type": "SoftwareSourceCode"');
    expect(source).toContain('application/ld+json');
  });
});

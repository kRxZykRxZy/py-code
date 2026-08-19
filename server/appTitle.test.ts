import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("managed application title", () => {
  it("uses the GitFolio title in the runtime configuration", () => {
    expect(process.env.VITE_APP_TITLE).toBe("GitFolio");
  });

  it("uses GitFolio in the installable web-app manifest", async () => {
    const manifest = await readFile(join(process.cwd(), "client/public/manifest.json"), "utf8");
    expect(manifest).toContain('"name": "GitFolio"');
    expect(manifest).toContain('"short_name": "GitFolio"');
  });
});

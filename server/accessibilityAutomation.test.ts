import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../shared/colorContrast";

describe("automated accessibility safeguards", () => {
  it("keeps keyboard, screen-reader, and reduced-motion entry points in the public UI", async () => {
    const home = await readFile(join(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    const css = await readFile(join(process.cwd(), "client/src/index.css"), "utf8");
    expect(home).toContain('className="skip-link" href="#work"');
    expect(home).toContain('aria-live="polite"');
    expect(home).toContain('aria-label="Portfolio sections"');
    expect(home).toContain("<main");
    expect(home).toContain('event.key === "/"');
    expect(css).toContain("button:focus-visible");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps primary GitFolio text pairs above WCAG AA contrast for normal text", () => {
    expect(contrastRatio("#14221f", "#f5f6f2")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#365b1e", "#edf7d8")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#123a32", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});

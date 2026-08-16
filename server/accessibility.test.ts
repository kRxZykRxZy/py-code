import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

describe("accessibility regression contract", () => {
  it("keeps global focus visibility and reduced-motion safeguards", async () => {
    const css = await readFile(join(projectRoot, "client/src/index.css"), "utf8");
    expect(css).toContain("button:focus-visible");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("scroll-behavior: auto !important");
  });

  it("keeps keyboard skip navigation and observable public portfolio feedback", async () => {
    const home = await readFile(join(projectRoot, "client/src/pages/Home.tsx"), "utf8");
    expect(home).toContain('className="skip-link" href="#work"');
    expect(home).toContain('id="work" tabIndex={-1}');
    expect(home).toContain('aria-live="polite"');
    expect(home).toContain('aria-label={`Open ${repo.name} source`}');
    expect(home).toContain('aria-label="Portfolio sections"');
  });

  it("keeps the keyboard-accessible workspace command palette", async () => {
    const home = await readFile(join(projectRoot, "client/src/pages/Home.tsx"), "utf8");
    expect(home).toContain("WorkspaceCommandPalette");
    expect(home).toContain("CommandDialog");
    expect(home).toContain('event.metaKey || event.ctrlKey');
    expect(home).toContain('event.key === "/"');
    expect(home).toContain("navigationChordRef");
    expect(home).toContain('o: "Overview"');
    expect(home).toContain('e: "Portfolio editor"');
    expect(home).toContain('placeholder="Search workspace actions…"');
  });
});

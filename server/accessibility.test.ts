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

  it("keeps editable notification preferences visible in Settings", async () => {
    const home = await readFile(join(projectRoot, "client/src/pages/Home.tsx"), "utf8");
    expect(home).toContain("Anonymous analytics");
    expect(home).toContain("Weekly digest");
    expect(home).toContain("notificationUpdate.mutate({ analytics:");
    expect(home).toContain("notificationUpdate.mutate({ digest:");
    expect(home).toContain("checked={notificationPrefs?.analytics !== false}");
    expect(home).toContain("checked={notificationPrefs?.digest !== false}");
  });

  it("keeps secure preview-link wiring visible across route and Settings", async () => {
    const home = await readFile(join(projectRoot, "client/src/pages/Home.tsx"), "utf8");
    const router = await readFile(join(projectRoot, "server/routers.ts"), "utf8");
    expect(home).toContain("previewToken");
    expect(home).toContain("Copy preview link");
    expect(home).toContain("trpc.portfolio.previewLink.useQuery");
    expect(router).toContain("previewToken");
    expect(router).toContain("previewLink:");
    expect(router).toContain("createPreviewToken");
  });

  it("keeps all plan usage indicators visible in Settings", async () => {
    const home = await readFile(join(projectRoot, "client/src/pages/Home.tsx"), "utf8");
    expect(home).toContain("Repositories");
    expect(home).toContain("AI summaries");
    expect(home).toContain("Custom CSS");
    expect(home).toContain("trpc.billing.usage.useQuery");
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

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

  it("keeps section ordering controls draggable and persisted", async () => {
    const home = await readFile(join(projectRoot, "client/src/pages/Home.tsx"), "utf8");
    expect(home).toContain("githubfolio.section-order");
    expect(home).toContain("draggingSection");
    expect(home).toContain("sectionVisibility");
    expect(home).toContain("aria-label={`Reorder ${x}`}");
    expect(home).toContain("aria-label={`Toggle visibility for ${x}`}");
    expect(home).toContain("updateSectionConfig");
  });

  it("covers section-config hydration and all five public section mappings", async () => {
    const home = await readFile(join(projectRoot, "client/src/pages/Home.tsx"), "utf8");
    expect(home).toContain("remoteSectionConfig");
    for (const section of ["Hero introduction", "Selected work", "Writing", "Currently learning", "Contact link"]) expect(home).toContain(`sectionPosition(\"${section}\")`);
    expect(home).toContain("publicSectionVisibility");
    expect(home).toContain("id=\"learning\"");
    expect(home).toContain("id=\"contact\"");
  });

  it("keeps public project detail routing and narrative content wired", async () => {
    const home = await readFile(join(projectRoot, "client/src/pages/Home.tsx"), "utf8");
    expect(home).toContain("pathParts[1] === \"projects\"");
    expect(home).toContain("focusedProject");
    expect(home).toContain("AI showcase narrative");
    expect(home).toContain("showcaseNarrative");
    expect(home).toContain("focusedProject.detailNarrative || focusedProject.summary");
    expect(home).toContain("{repo.summary}");
    expect(home).toContain("Project not found.");
    expect(home).toContain("Back to portfolio");
    expect(home).toContain("Read project →");
    expect(home).toContain("/featured");
    expect(home).toContain("Read showcase →");
    expect(home).toContain("Pinned project comparison");
    expect(home).toContain("compare-${repo.name}");
    expect(home).toContain("Open-source contribution highlights");
    expect(home).toContain("oss-${repo.name}");
    expect(home).toContain("GitHub activity timeline");
    expect(home).toContain("Activity dates will appear after the next GitHub sync.");
    expect(home).toContain("activityCells");
    expect(home).toContain("repository update");
    expect(home).toContain("githubActivity");
    expect(home).toContain("profileActivityEvents");
    expect(home).toContain("eventActivityCells");
    expect(home).toContain("profileContributionDays");
    expect(home).toContain("contributionCalendarCells");
    expect(home).toContain("contributionCalendarCells.some(Boolean)");
    const schema = await readFile(join(projectRoot, "drizzle/schema.ts"), "utf8");
    const router = await readFile(join(projectRoot, "server/routers.ts"), "utf8");
    const integrations = await readFile(join(projectRoot, "server/integrations.ts"), "utf8");
    expect(integrations).toContain("pushed commits");
    expect(router).toContain("getGitHubUserEvents");
    expect(schema).toContain("lastActivityAt");
    expect(router).toContain("lastActivityAt: repo.updated_at");
    expect(router).toContain("updatedAt: repo.updatedAt || repo.lastActivityAt || null");
    expect(router).toContain("updatedAt: repo.updated_at || null");
    expect(home).toContain("Repository activity heatmap");
    expect(home).toContain("No repository activity dates are available yet. Sync GitHub to populate this rhythm.");
    expect(home).toContain("SSL ready");
    expect(home).toContain("SSL pending");
    expect(home).toContain("DNS pending");
  });

  it("surfaces repository intelligence on public and editor project cards", async () => {
    const home = await readFile(join(projectRoot, "client/src/pages/Home.tsx"), "utf8");
    expect(home).toContain("healthScore: repo.healthScore ?? null");
    expect(home).toContain("complexityLevel: repo.complexityLevel ?? null");
    expect(home).toContain("projectCategory: repo.projectCategory ?? null");
    expect(home).toContain("Health {repo.healthScore}/100");
    expect(home).toContain("Complexity {repo.complexityLevel}");
    expect(home).toContain("aria-label={`${repo.name} repository health score`}");
    expect(home).toContain("aria-label={`${repo.name} complexity level`}");
    expect(home).toContain("compareProjects");
    expect(home).toContain("projectComparison");
    expect(home).toContain("AI project comparison");
    expect(home).toContain("rewriteBio");
    expect(home).toContain("Rewrite bio");
    expect(home).toContain("suggestTitle");
    expect(home).toContain("Suggest title for");
    expect(home).toContain("suggestTags");
    expect(home).toContain("Suggest tags for");
    expect(home).toContain("suggestSummary");
    expect(home).toContain("Approve summary for");
    expect(home).toContain("Edit summary draft for");
    expect(home).toContain("setSummarySuggestions(current=>({ ...current, [r.name]: event.target.value }))");
    expect(home).toContain("Reject summary for");
    expect(home).toContain("aiSummary: summarySuggestions[r.name]");
    expect(home).toContain("recordAiGeneration");
    expect(home).toContain("AI generation history");
    expect(home).toContain("submitContact");
    expect(home).toContain("Your name");
    expect(home).toContain("Your email");
    expect(home).toContain("Your message");
    expect(home).toContain("Thanks — your message was sent.");
    expect(home).toContain("contactWebsite");
    expect(home).toContain("contactStartedAt");
    expect(home).toContain("subscribeNewsletter");
    expect(home).toContain("Newsletter email");
    expect(home).toContain("unsubscribeNewsletter");
    expect(home).toContain("unsubscribe");
    expect(home).toContain("newsletterUnsubscribeUrl");
    expect(home).toContain("Unsubscribe");
    expect(home).toContain("Recommendations");
    expect(home).toContain("Add link");
    expect(home).toContain("Recommendation URL");
    expect(home).toContain("Recommended next");
    expect(home).toContain("Endorsements");
    expect(home).toContain("Add endorsement");
    expect(home).toContain("Endorsement URL");
    expect(home).toContain("Guestbook");
    expect(home).toContain("Guestbook name");
    expect(home).toContain("Guestbook message");
    expect(home).toContain("Sign guestbook");
    expect(home).toContain("aiAudit.slice(0, 5)");
    expect(home).toContain("displayName: repo.displayName || repo.name");
    expect(home).toContain("repo.displayName || repo.name");
    expect(home).toContain("r.displayName || r.name");
    expect(home).toContain("topics: Array.isArray(repo.topics) ? repo.topics : []");
    expect(home).toContain("(repo.topics || []).slice(0,3)");
  });

  it("keeps repository ordering controls draggable and accessible", async () => {
    const home = await readFile(join(projectRoot, "client/src/pages/Home.tsx"), "utf8");
    expect(home).toContain("draggable");
    expect(home).toContain("onDragStart");
    expect(home).toContain("onDrop");
    expect(home).toContain("aria-label={`Reorder ${r.name}`}");
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

  it("keeps durable contact abuse controls and owner alerts wired", async () => {
    const router = await readFile(join(projectRoot, "server/routers.ts"), "utf8");
    expect(router).toContain("clientKey");
    expect(router).toContain("TOO_MANY_REQUESTS");
    expect(router).toContain("notifyOwner");
    expect(router).toContain("contactMessages");
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

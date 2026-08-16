import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { localGet, localSet } from "./localStore";

vi.mock("./db", () => ({ getDb: vi.fn().mockResolvedValue(null) }));
vi.mock("./integrations", () => ({
  integrationConfig: { paddleConfigured: false, paidTiers: [], storageMode: "local-sqlite" },
  getGitHubProfile: vi.fn().mockResolvedValue({ id: 42, login: "octo-dev", name: "Octo Dev", bio: "GitHub builder", avatar_url: "https://example.test/avatar.png", location: null, blog: null }),
  getGitHubRepos: vi.fn().mockResolvedValue([{ id: 9001, name: "folio", description: "Portfolio app", language: "TypeScript", stargazers_count: 7, forks_count: 2, html_url: "https://github.com/octo-dev/folio", homepage: null }]),
  summarizeRepository: vi.fn().mockResolvedValue("A portfolio app."),
  generatePortfolioNarrative: vi.fn().mockResolvedValue({ headline: "Builder", skills: ["TypeScript"] }),
}));

import { appRouter } from "./routers";

function githubContext(): TrpcContext {
  const now = new Date();
  return { user: { id: -42, openId: "github:42", email: null, name: "Octo Dev", loginMethod: "github", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("GitHub local fallback sync", () => {
  it("syncs using the authorization token persisted at GitHub-only sign-in", async () => {
    localSet("githubConnection:github:42", { githubId: "42", accessToken: "stored-oauth-token", scope: "read:user" });
    const result = await appRouter.createCaller(githubContext()).portfolio.syncGitHub();
    expect(result).toEqual({ profile: { login: "octo-dev", name: "Octo Dev" }, repositories: 1 });
  });

  it("regenerates stored project summaries without requiring a manual GitHub token", async () => {
    localSet("githubConnection:github:42", { githubId: "42", login: "octo-dev", accessToken: "stored-oauth-token", scope: "read:user" });
    localSet("profile:octo-dev", { slug: "octo-dev", repositories: [{ name: "folio", description: "Portfolio app", language: "TypeScript", aiSummary: "Old summary" }] });
    await expect(appRouter.createCaller(githubContext()).portfolio.regenerateSummaries()).resolves.toEqual({ regenerated: 1 });
    expect(localGet<any>("profile:octo-dev", null)?.repositories?.[0]?.aiSummary).toBe("A portfolio app.");
  });
});

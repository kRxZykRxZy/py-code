import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { localGet, localSet } from "./localStore";

vi.mock("./db", () => ({ getDb: vi.fn().mockResolvedValue(null) }));
vi.mock("./integrations", () => ({
  integrationConfig: { paddleConfigured: false, paidTiers: [], storageMode: "local-sqlite" },
  getGitHubProfile: vi.fn().mockResolvedValue({ id: 42, login: "octo-dev", name: "Octo Dev", bio: "GitHub builder", avatar_url: "https://example.test/avatar.png", location: null, blog: null, followers: 12, following: 5 }),
  getGitHubRepos: vi.fn().mockResolvedValue([{ id: 9001, name: "folio", description: "Portfolio app", language: "TypeScript", stargazers_count: 7, forks_count: 2, html_url: "https://github.com/octo-dev/folio", homepage: null, topics: ["portfolio", "typescript"], archived: true, fork: true, owner: { login: "octo-labs", type: "Organization" }, license: { spdx_id: "MIT" }, default_branch: "main", open_issues_count: 6 }]),
  getGitHubOrganizationRepos: vi.fn().mockResolvedValue([{ id: 9002, name: "org-folio", description: "Organization portfolio app", language: "TypeScript", stargazers_count: 4, forks_count: 1, html_url: "https://github.com/octo-labs/org-folio", homepage: null, topics: ["organization"], archived: false, fork: false, owner: { login: "octo-labs", type: "Organization" }, license: { name: "Apache-2.0" }, default_branch: "trunk", open_issues_count: 3 }]),
  getGitHubPinnedRepositoryIds: vi.fn().mockResolvedValue([9001]),
  getGitHubOpenPullRequestCount: vi.fn((_token: string, repository: { name: string }) => Promise.resolve(repository.name === "folio" ? 2 : 1)),
  getGitHubContributorCount: vi.fn((_token: string, repository: { name: string }) => Promise.resolve(repository.name === "folio" ? 8 : 3)),
  getGitHubLatestRelease: vi.fn((_token: string, repository: { name: string }) => Promise.resolve(repository.name === "folio" ? { tag: "v2.0.0", publishedAt: "2026-08-01T00:00:00.000Z" } : { tag: null, publishedAt: null })),
  getGitHubCommitActivity: vi.fn((_token: string, repository: { name: string }) => Promise.resolve(repository.name === "folio" ? [1, 3, 2] : [0, 1])),
  getGitHubLanguageBreakdown: vi.fn((_token: string, repository: { name: string }) => Promise.resolve(repository.name === "folio" ? { TypeScript: 8000, CSS: 2000 } : { TypeScript: 5000 })),
  summarizeCommitActivity: vi.fn((activity: unknown) => Array.isArray(activity) && activity.length ? "6 commits across 3/3 recent weeks; peak week 3" : "No recent commit activity data"),
  deriveRepositoryHealth: vi.fn().mockReturnValue(72),
  deriveComplexityLevel: vi.fn().mockReturnValue("Medium"),
  classifyProjectCategory: vi.fn().mockReturnValue("Web experience"),
  summarizeRepository: vi.fn().mockResolvedValue("A portfolio app."),
  generatePortfolioNarrative: vi.fn().mockResolvedValue({ headline: "Builder", skills: ["TypeScript"] }),
}));

import { appRouter } from "./routers";

function githubContext(): TrpcContext {
  const now = new Date();
  return { user: { id: -42, openId: "github:42", email: null, name: "Octo Dev", loginMethod: "github", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"] };
}
function publicContext(): TrpcContext { return { user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"] }; }

describe("GitHub local fallback sync", () => {
  it("syncs using the authorization token persisted at GitHub-only sign-in", async () => {
    localSet("githubConnection:github:42", { githubId: "42", accessToken: "stored-oauth-token", scope: "read:user" });
    const result = await appRouter.createCaller(githubContext()).portfolio.syncGitHub();
    expect(result).toEqual({ profile: { login: "octo-dev", name: "Octo Dev" }, repositories: 2 });
    expect(localGet<any>("profile:octo-dev", null)).toEqual(expect.objectContaining({ followerCount: 12, followingCount: 5 }));
    expect(localGet<any>("profile:octo-dev", null)?.repositories).toEqual(expect.arrayContaining([expect.objectContaining({ name: "folio", organizationName: "octo-labs", topics: ["portfolio", "typescript"], isArchived: true, isFork: true, licenseName: "MIT", defaultBranch: "main", openIssues: 4, openPullRequests: 2, contributorCount: 8, latestReleaseTag: "v2.0.0", commitActivity: [1, 3, 2], languageBreakdown: { TypeScript: 8000, CSS: 2000 }, isPinned: true }), expect.objectContaining({ name: "org-folio", organizationName: "octo-labs", topics: ["organization"], isArchived: false, isFork: false, licenseName: "Apache-2.0", defaultBranch: "trunk", openIssues: 2, openPullRequests: 1, contributorCount: 3, latestReleaseTag: null, commitActivity: [0, 1], languageBreakdown: { TypeScript: 5000 }, isPinned: false })]));
  });

  it("regenerates stored project summaries without requiring a manual GitHub token", async () => {
    localSet("githubConnection:github:42", { githubId: "42", login: "octo-dev", accessToken: "stored-oauth-token", scope: "read:user" });
    localSet("profile:octo-dev", { slug: "octo-dev", repositories: [{ name: "folio", description: "Portfolio app", language: "TypeScript", aiSummary: "Old summary" }] });
    await expect(appRouter.createCaller(githubContext()).portfolio.regenerateSummaries()).resolves.toEqual({ regenerated: 1 });
    expect(localGet<any>("profile:octo-dev", null)?.repositories?.[0]?.aiSummary).toBe("A portfolio app.");
  });

  it("normalizes repository display text before local persistence", async () => {
    await expect(appRouter.createCaller(githubContext()).portfolio.updateRepository({ id: 77, displayName: "  <b>Folio</b>\u0000  ", displayDescription: "  A\nthoughtful <script> project  ", sortOrder: 3 })).resolves.toEqual({ success: true });
    expect(localGet<any>("repo:github:42:77", null)).toMatchObject({ displayName: "bFolio/b", displayDescription: "A thoughtful script project", sortOrder: 3 });
  });

  it("persists repository ordering into the local profile and public route", async () => {
    localSet("githubConnection:github:42", { login: "octo-dev" });
    localSet("profile:octo-dev", { slug: "octo-dev", isPublic: true, repositories: [{ id: 1, name: "first", sortOrder: 0 }, { id: 2, name: "second", sortOrder: 1 }] });
    const caller = appRouter.createCaller(githubContext());
    await caller.portfolio.updateRepository({ id: 2, sortOrder: 0 });
    await caller.portfolio.updateRepository({ id: 1, sortOrder: 1 });
    const reloaded = await caller.portfolio.myProfile();
    expect(reloaded?.repositories?.map((repo: any) => repo.name)).toEqual(["second", "first"]);
    const publicProfile = await appRouter.createCaller(publicContext()).portfolio.bySlug({ slug: "octo-dev" });
    expect(publicProfile?.repositories?.map((repo: any) => repo.name)).toEqual(["second", "first"]);
  });

  it("normalizes profile copy and rejects unsafe website protocols before fallback persistence", async () => {
    const caller = appRouter.createCaller(githubContext());
    await expect(caller.portfolio.updateProfileCopy({ slug: "octo-dev", displayName: "  <b>Octo Dev</b>  ", bio: "  Calm\n<em>builder</em>  ", websiteUrl: "https://example.com/about" })).resolves.toMatchObject({ displayName: "bOcto Dev/b", bio: "Calm embuilder/em", websiteUrl: "https://example.com/about" });
    expect(localGet<any>("profile:octo-dev", null)).toMatchObject({ displayName: "bOcto Dev/b", bio: "Calm embuilder/em", websiteUrl: "https://example.com/about" });
    await expect(caller.portfolio.updateProfileCopy({ slug: "octo-dev", websiteUrl: "javascript:alert(1)" })).rejects.toThrow("Website URL must use http or https");
  });

  it("exports account data without OAuth tokens and deletes local account records only after exact confirmation", async () => {
    const caller = appRouter.createCaller(githubContext());
    localSet("githubConnection:github:42", { githubId: "42", login: "octo-dev", accessToken: "private-token", scope: "read:user" });
    localSet("profile:octo-dev", { slug: "octo-dev", bio: "Builder" });
    localSet("billing:-42", { plan: "pro", status: "active" });
    localSet("repo:github:42:8", { displayName: "Current user repo" });
    localSet("repo:github:99:8", { displayName: "Another user repo" });
    const exported = await caller.account.exportData();
    expect(exported).toMatchObject({ profile: { slug: "octo-dev" }, githubConnection: { githubId: "42", scope: "read:user" } });
    expect(JSON.stringify(exported)).not.toContain("private-token");
    await expect(caller.account.deleteAccount({ confirmation: "delete" as never })).rejects.toBeTruthy();
    await expect(caller.account.deleteAccount({ confirmation: "DELETE MY ACCOUNT" })).resolves.toEqual({ deleted: true });
    expect(localGet("profile:octo-dev", null)).toBeNull();
    expect(localGet("githubConnection:github:42", null)).toBeNull();
    expect(localGet("repo:github:42:8", null)).toBeNull();
    expect(localGet("repo:github:99:8", null)).toMatchObject({ displayName: "Another user repo" });
  });
});

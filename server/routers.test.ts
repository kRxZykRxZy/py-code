import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { localGet, localSet } from "./localStore";

function publicContext(): TrpcContext {
  return {
    user: undefined,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function authenticatedContext(): TrpcContext {
  return { ...publicContext(), user: { id: 9981, openId: "fallback-test-user", email: "fallback@example.com", name: "Fallback Tester", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } };
}

function adminContext(): TrpcContext {
  return { ...publicContext(), user: { id: 9982, openId: "owner-admin", email: "owner@example.com", name: "Owner Admin", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } };
}

describe("core portfolio procedures", () => {
  it("returns the demo public profile by slug", async () => {
    const caller = appRouter.createCaller(publicContext());
    const profile = await caller.portfolio.bySlug({ slug: "alexmorgan" });
    expect(profile?.slug).toBe("alexmorgan");
    expect(profile?.repositories?.length).toBeGreaterThan(0);
    expect(profile?.repositories?.[0]?.detailNarrative).toContain(profile?.repositories?.[0]?.aiSummary);
  });

  it("exposes integration readiness without leaking credentials", async () => {
    const caller = appRouter.createCaller(publicContext());
    const readiness = await caller.integrations();
    expect(readiness).toHaveProperty("paddleConfigured");
    expect(readiness).toHaveProperty("storageMode");
    expect(JSON.stringify(readiness)).not.toContain("SECRET");
  });

  it("records an analytics event successfully for an unknown public slug", async () => {
    const caller = appRouter.createCaller(publicContext());
    await expect(caller.analytics.record({ slug: "unknown-profile", referrer: "github.com" })).resolves.toEqual({ ok: true, recorded: true });
  });

  it("persists profile settings through the local fallback", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const adminCaller = appRouter.createCaller(adminContext());
    await adminCaller.admin.updateCustomer({ userId: 9981, plan: "pro", managedDomainAddOn: false, managedDomainStatus: "none" });
    await caller.portfolio.saveSettings({ slug: "fallback-tester", template: "terminal", customCss: ".hero { color: red; }", isPublic: true });
    const publicCaller = appRouter.createCaller(publicContext());
    const profile = await publicCaller.portfolio.bySlug({ slug: "fallback-tester" });
    expect(profile?.slug).toBe("fallback-tester");
    expect(profile?.template).toBe("terminal");
  });

  it("blocks free accounts from saving custom CSS while allowing template settings without it", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const adminCaller = appRouter.createCaller(adminContext());
    await adminCaller.admin.updateCustomer({ userId: 9981, plan: "free", managedDomainAddOn: false, managedDomainStatus: "none" });
    await expect(caller.portfolio.saveSettings({ slug: "fallback-tester", template: "editorial", customCss: ".hero { color: red; }", isPublic: true })).rejects.toThrow("custom CSS");
    await expect(caller.portfolio.saveSettings({ slug: "fallback-tester", template: "editorial", customCss: "", isPublic: true })).resolves.toMatchObject({ template: "editorial", customCss: "" });
  });

  it("persists public slug and visibility settings independently of custom CSS", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.portfolio.updatePublishing({ slug: "fallback-private", isPublic: false })).resolves.toEqual({ slug: "fallback-private", isPublic: false });
  });

  it("applies the larger Pro+ custom CSS allowance server-side", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const adminCaller = appRouter.createCaller(adminContext());
    const longCss = ".x{}".repeat(501);
    await adminCaller.admin.updateCustomer({ userId: 9981, plan: "pro", managedDomainAddOn: false, managedDomainStatus: "none" });
    await expect(caller.portfolio.saveSettings({ slug: "fallback-tester", template: "atelier", customCss: longCss, isPublic: true })).rejects.toThrow("2,000 characters");
    await adminCaller.admin.updateCustomer({ userId: 9981, plan: "proPlus", managedDomainAddOn: false, managedDomainStatus: "none" });
    await expect(caller.portfolio.saveSettings({ slug: "fallback-tester", template: "atelier", customCss: longCss, isPublic: true })).resolves.toMatchObject({ customCss: longCss });
  });

  it("rejects unsafe custom CSS before persisting it for a paid account", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const adminCaller = appRouter.createCaller(adminContext());
    await adminCaller.admin.updateCustomer({ userId: 9981, plan: "pro", managedDomainAddOn: false, managedDomainStatus: "none" });
    await expect(caller.portfolio.saveSettings({ slug: "fallback-tester", template: "atelier", customCss: ".card { background: url(https://example.com/a.png); }", isPublic: true })).rejects.toThrow("External URLs");
  });

  it("persists notification preferences through the local store", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const saved = await caller.notifications.update({ browser: "granted", analytics: false, digest: false });
    expect(saved.browser).toBe("granted");
    expect(saved.analytics).toBe(false);
    expect(saved.digest).toBe(false);
    await expect(caller.notifications.get()).resolves.toMatchObject({ browser: "granted", analytics: false, digest: false });
  });

  it("blocks non-admin users from customer plan management", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.admin.customers()).rejects.toThrow("Admin access required");
    await expect(caller.admin.updateCustomer({ userId: 9981, plan: "pro", managedDomainAddOn: true, managedDomainName: "example.dev", managedDomainStatus: "requested" })).rejects.toThrow("Admin access required");
  });

  it("allows the owner-admin to update a managed-domain subscription", async () => {
    const caller = appRouter.createCaller(adminContext());
    const result = await caller.admin.updateCustomer({ userId: 9982, plan: "pro", managedDomainAddOn: true, managedDomainName: "portfolio.dev", managedDomainStatus: "requested" });
    expect(result).toMatchObject({ userId: 9982, plan: "pro", managedDomainAddOn: true, managedDomainName: "portfolio.dev", managedDomainStatus: "requested" });
  });

  it("rejects malformed plan and managed-domain status changes before they reach the admin procedure", async () => {
    const caller = appRouter.createCaller(adminContext());
    await expect(caller.admin.updateCustomer({ userId: 9982, plan: "enterprise" as never, managedDomainAddOn: false, managedDomainStatus: "none" })).rejects.toBeTruthy();
    await expect(caller.admin.updateCustomer({ userId: 9982, plan: "pro", managedDomainAddOn: true, managedDomainStatus: "shipped" as never })).rejects.toBeTruthy();
  });

  it("blocks free accounts from connecting or requesting domains", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const adminCaller = appRouter.createCaller(adminContext());
    await adminCaller.admin.updateCustomer({ userId: 9981, plan: "free", managedDomainAddOn: false, managedDomainStatus: "none" });
    await expect(caller.domains.add({ domain: "fallback.dev" })).rejects.toThrow("active Pro or Pro+ plan");
    await expect(caller.billing.requestManagedDomain({ domain: "managed.dev" })).rejects.toThrow("active Pro or Pro+ plan");
  });

  it("records a managed-domain request for an active paid account", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const adminCaller = appRouter.createCaller(adminContext());
    await adminCaller.admin.updateCustomer({ userId: 9981, plan: "pro", managedDomainAddOn: false, managedDomainStatus: "none" });
    await expect(caller.billing.requestManagedDomain({ domain: "managed.dev" })).resolves.toMatchObject({ managedDomainAddOn: true, managedDomainName: "managed.dev", managedDomainStatus: "requested" });
  });

  it("rejects invalid public profile slugs", async () => {
    const caller = appRouter.createCaller(publicContext());
    await expect(caller.portfolio.bySlug({ slug: "" })).rejects.toBeTruthy();
  });
});


describe("billing usage procedures", () => {
  it("returns free-plan limits and local usage counts", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const adminCaller = appRouter.createCaller(adminContext());
    await adminCaller.admin.updateCustomer({ userId: 9981, plan: "free", managedDomainAddOn: false, managedDomainStatus: "none" });
    const usage = await caller.billing.usage();
    expect(usage.plan).toBe("free");
    expect(usage.limits).toEqual({ aiSummaries: 3, customCssChars: 0 });
    expect(usage.usage).toEqual(expect.objectContaining({ repositories: expect.any(Number), aiSummaries: expect.any(Number), customCssChars: expect.any(Number) }));
  });

  it("returns the larger Pro+ CSS allowance and unlimited summaries", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const adminCaller = appRouter.createCaller(adminContext());
    await adminCaller.admin.updateCustomer({ userId: 9981, plan: "proPlus", managedDomainAddOn: false, managedDomainStatus: "none" });
    const usage = await caller.billing.usage();
    expect(usage.plan).toBe("proPlus");
    expect(usage.limits).toEqual({ aiSummaries: null, customCssChars: 20_000 });
  });
});



describe("private portfolio preview links", () => {
  it("blocks missing tokens, allows the generated token, and preserves it through settings saves", async () => {
    localSet("githubConnection:fallback-test-user", { login: "preview-user" });
    const token = "stable-preview-token";
    localSet("profile:preview-user", { slug: "preview-user", displayName: "Preview User", isPublic: false, previewToken: token, repositories: [] });
    const caller = appRouter.createCaller(authenticatedContext());
    const publicCaller = appRouter.createCaller(publicContext());
    await expect(publicCaller.portfolio.bySlug({ slug: "preview-user" })).resolves.toBeNull();
    await expect(publicCaller.portfolio.bySlug({ slug: "preview-user", previewToken: token })).resolves.toMatchObject({ slug: "preview-user", isPublic: false });
    await caller.portfolio.saveSettings({ slug: "preview-user", template: "atelier", customCss: "", isPublic: false });
    expect(localGet<any>("profile:preview-user", null)?.previewToken).toBe(token);
  });
});

describe("billing customer portal", () => {
  it("does not expose a portal URL when Paddle portal configuration is absent", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const portal = await caller.billing.customerPortal();
    expect(portal).toEqual({ configured: false, url: null });
  });
});

describe("section configuration", () => {
  it("persists ordered sections and visibility to the local profile and public route", async () => {
    localSet("githubConnection:fallback-test-user", { login: "sections-user" });
    localSet("profile:sections-user", { slug: "sections-user", isPublic: true, repositories: [] });
    const caller = appRouter.createCaller(authenticatedContext());
    const publicCaller = appRouter.createCaller(publicContext());
    await caller.portfolio.updatePublishing({ slug: "sections-user", isPublic: true });
    const sectionConfig = { order: ["Selected work", "Hero introduction", "Writing"], visibility: { "Hero introduction": true, "Selected work": false, Writing: true } };
    await expect(caller.portfolio.updateSectionConfig({ slug: "sections-user", sectionConfig })).resolves.toEqual(sectionConfig);
    await expect(publicCaller.portfolio.bySlug({ slug: "sections-user" })).resolves.toMatchObject({ sectionConfig });
  });
});

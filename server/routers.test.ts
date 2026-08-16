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

describe("public activity timeline data", () => {
  it("exposes synced repository updatedAt values in local fallback profiles", async () => {
    localSet("profile:activity-user", { slug: "activity-user", isPublic: true, repositories: [{ name: "timeline-project", description: "A project", language: "TypeScript", aiSummary: "A summary", updatedAt: "2026-08-15T10:00:00.000Z" }] });
    const publicCaller = appRouter.createCaller(publicContext());
    await expect(publicCaller.portfolio.bySlug({ slug: "activity-user" })).resolves.toMatchObject({ repositories: [{ name: "timeline-project", updatedAt: "2026-08-15T10:00:00.000Z" }] });
  });
});

describe("profile content authoring", () => {
  it("persists headline and tagline content in the local fallback section configuration", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const current = await caller.portfolio.myProfile();
    const slug = current?.slug || `content-author-${Date.now()}`;
    if (!current) await caller.portfolio.updatePublishing({ slug, isPublic: true });
    await caller.portfolio.updateProfileCopy({ slug, headline: "Designing useful systems", tagline: "Open to thoughtful collaborations", timezone: "Europe/London", availabilityStatus: "Available for select work", currentFocus: "Design systems", nowStatus: "Shipping a calm workspace", learningStatus: "Distributed systems", writingNotes: [{ title: "Building quietly", url: "https://example.com/notes/building-quietly", publishedAt: "2026-08-16", sortOrder: 0 }], manualProjects: [{ title: "Field Notes", description: "A small manual project.", tags: ["Research", "Writing"], url: "https://example.com/field-notes", visible: true, sortOrder: 0 }], location: "London" });
    const publicProfile = await appRouter.createCaller(publicContext()).portfolio.bySlug({ slug });
    expect(publicProfile?.sectionConfig?.content).toMatchObject({ headline: "Designing useful systems", tagline: "Open to thoughtful collaborations", timezone: "Europe/London", availabilityStatus: "Available for select work", currentFocus: "Design systems", nowStatus: "Shipping a calm workspace", learningStatus: "Distributed systems", writingNotes: [{ title: "Building quietly", url: "https://example.com/notes/building-quietly", publishedAt: "2026-08-16", sortOrder: 0 }], manualProjects: [{ title: "Field Notes", description: "A small manual project.", tags: ["Research", "Writing"], url: "https://example.com/field-notes", visible: true, sortOrder: 0 }] });
    expect(publicProfile?.location).toBe("London");
  });
});

  it("rejects unsafe writing-note URLs", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.portfolio.updateProfileCopy({ slug: "unsafe-note", writingNotes: [{ title: "Unsafe", url: "javascript:alert(1)", sortOrder: 0 }] })).rejects.toThrow("Writing note links must use http or https");
  });

  it("rejects unsafe manual-project URLs", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.portfolio.updateProfileCopy({ slug: "unsafe-manual-project", manualProjects: [{ title: "Unsafe", description: "Bad link", tags: [], url: "javascript:alert(1)", visible: true, sortOrder: 0 }] })).rejects.toThrow("Manual project links must use http or https");
  });

  it("rejects invalid project image payloads before storage", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.portfolio.uploadProjectImage({ slug: "image-project", projectIndex: 0, fileName: "cover.svg", mimeType: "image/png", dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" })).rejects.toThrow("Upload a valid JPEG, PNG, WebP, or GIF image");
  });

  it("persists repository-backed project image metadata through the public profile", async () => {
    localSet("githubConnection:fallback-test-user", { login: "repo-image-project" });
    localSet("profile:repo-image-project", { slug: "repo-image-project", isPublic: true, repositories: [{ id: 42, name: "repo-image", description: "Repository project", imageUrl: null }] });
    const caller = appRouter.createCaller(authenticatedContext());
    const publicCaller = appRouter.createCaller(publicContext());
    await caller.portfolio.updateRepository({ id: 42, imageUrl: "/manus-storage/project-images/repo-cover.png", imageKey: "project-images/repo-cover.png", imageAlt: "A repository cover", imageCrop: { x: 25, y: 70, scale: 1.4 } });
    const profile = await publicCaller.portfolio.bySlug({ slug: "repo-image-project" });
    expect(profile?.repositories?.[0]).toMatchObject({ imageUrl: "/manus-storage/project-images/repo-cover.png", imageKey: "project-images/repo-cover.png", imageAlt: "A repository cover", imageCrop: { x: 25, y: 70, scale: 1.4 } });
  });

  it("persists project image metadata with alt text and crop values", async () => {
    localSet("githubConnection:fallback-test-user", { login: "image-metadata-project" });
    const caller = appRouter.createCaller(authenticatedContext());
    const publicCaller = appRouter.createCaller(publicContext());
    await caller.portfolio.updatePublishing({ slug: "image-metadata-project", isPublic: true });
    await caller.portfolio.updateProfileCopy({ slug: "image-metadata-project", manualProjects: [{ title: "Image project", description: "A project with a cover.", tags: ["Design"], imageUrl: "/manus-storage/project-images/image-project/cover.png", imageKey: "project-images/image-project/cover.png", imageAlt: "A blue interface", imageCrop: { x: 35, y: 65, scale: 1.2 }, visible: true, sortOrder: 0 }] });
    const profile = await publicCaller.portfolio.bySlug({ slug: "image-metadata-project" });
    expect(profile?.sectionConfig?.content?.manualProjects?.[0]).toMatchObject({ imageUrl: "/manus-storage/project-images/image-project/cover.png", imageAlt: "A blue interface", imageCrop: { x: 35, y: 65, scale: 1.2 } });
  });

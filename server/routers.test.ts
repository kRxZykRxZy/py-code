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

  it("persists sanitized Markdown portfolio copy through the public profile", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const slug = `markdown-author-${Date.now()}`;
    await caller.portfolio.updatePublishing({ slug, isPublic: true });
    await caller.portfolio.updateProfileCopy({ slug, markdownCopy: "# Hello <script>alert(1)</script>\n\n[Safe link](https://example.com) [Bad link](javascript:alert(1))" });
    const publicProfile = await appRouter.createCaller(publicContext()).portfolio.bySlug({ slug });
    expect(publicProfile?.sectionConfig?.content?.markdownCopy).toContain("# Hello alert(1)");
    expect(publicProfile?.sectionConfig?.content?.markdownCopy).not.toContain("<script>");
    expect(publicProfile?.sectionConfig?.content?.markdownCopy).not.toContain("javascript:");
  });
});

  it("persists CTA and ordered content blocks through the public profile", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const slug = `blocks-author-${Date.now()}`;
    await caller.portfolio.updatePublishing({ slug, isPublic: true });
    await caller.portfolio.updateProfileCopy({ slug, callToActionLabel: "Book a conversation", callToActionUrl: "https://example.com/contact", skillClusters: ["Developer tools", "<script>Data and AI</script>"], contentBlocks: [{ id: "principles", title: "Principles", body: "**Build calmly**", visible: true, sortOrder: 1 }, { id: "hidden", title: "Hidden", body: "Not public", visible: false, sortOrder: 0 }] });
    const publicProfile = await appRouter.createCaller(publicContext()).portfolio.bySlug({ slug });
    expect(publicProfile?.sectionConfig?.content).toMatchObject({ callToActionLabel: "Book a conversation", callToActionUrl: "https://example.com/contact", skillClusters: ["Developer tools", "scriptData and AI/script"], contentBlocks: [{ id: "principles", title: "Principles", visible: true, sortOrder: 1 }, { id: "hidden", visible: false }] });
  });

  it("rejects unsafe CTA URLs", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.portfolio.updateProfileCopy({ slug: "unsafe-cta", callToActionLabel: "Click", callToActionUrl: "javascript:alert(1)" })).rejects.toThrow("Call-to-action links must use http or https");
  });

  it("persists Hero and Contact CTAs independently", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const slug = `section-cta-${Date.now()}`;
    await caller.portfolio.updatePublishing({ slug, isPublic: true });
    await caller.portfolio.updateProfileCopy({ slug, heroCtaLabel: "Read the work", heroCtaUrl: "https://example.com/work", contactCtaLabel: "Email me", contactCtaUrl: "https://example.com/contact" });
    const publicProfile = await appRouter.createCaller(publicContext()).portfolio.bySlug({ slug });
    expect(publicProfile?.sectionConfig?.content).toMatchObject({ heroCtaLabel: "Read the work", heroCtaUrl: "https://example.com/work", contactCtaLabel: "Email me", contactCtaUrl: "https://example.com/contact" });
  });

  it("creates, lists, restores, duplicates, and clones portfolio revisions", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const slug = `revision-author-${Date.now()}`;
    await caller.portfolio.updatePublishing({ slug, isPublic: true });
    await caller.portfolio.updateProfileCopy({ slug, headline: "Before revision" });
    const saved = await caller.portfolio.saveRevision({ slug, label: "Before snapshot" });
    await caller.portfolio.updateProfileCopy({ slug, headline: "After revision" });
    const duplicate = await caller.portfolio.duplicatePortfolio({ slug, label: "Duplicate draft" });
    expect(duplicate.label).toBe("Duplicate draft");
    expect((await caller.portfolio.listRevisions({ slug })).length).toBeGreaterThanOrEqual(2);
    await caller.portfolio.cloneTemplate({ slug, template: "terminal" });
    expect((await caller.portfolio.myProfile())?.template).toBe("terminal");
    await caller.portfolio.restoreRevision({ slug, revisionId: saved.id });
    const restored = await appRouter.createCaller(publicContext()).portfolio.bySlug({ slug });
    expect(restored?.sectionConfig?.content?.headline).toBe("Before revision");
  });

  it("persists distinct portfolio drafts and restores a selected draft for a non-default slug", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const slug = `draft-author-${Date.now()}`;
    await caller.portfolio.updatePublishing({ slug, isPublic: true });
    await caller.portfolio.updateProfileCopy({ slug, headline: "Draft source" });
    const draft = await caller.portfolio.createDraftDuplicate({ slug, label: "Client-facing draft" });
    expect(draft.id).toMatch(/^draft-/);
    expect((await caller.portfolio.listDrafts({ slug }))[0]).toMatchObject({ id: draft.id, label: "Client-facing draft" });
    await caller.portfolio.updateProfileCopy({ slug, headline: "Changed active profile" });
    await caller.portfolio.restoreDraft({ slug, draftId: draft.id });
    const restored = await appRouter.createCaller(publicContext()).portfolio.bySlug({ slug });
    expect(restored?.sectionConfig?.content?.headline).toBe("Draft source");
  });

  it("persists sanitized repository exclusion rules for the active profile", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const slug = `exclude-author-${Date.now()}`;
    await caller.portfolio.updatePublishing({ slug, isPublic: true });
    const names = await caller.portfolio.updateExclusions({ slug, names: ["alpha", "alpha", "<script>beta</script>", ""] });
    expect(names).toEqual(["alpha", "scriptbeta/script"]);
    expect(await caller.portfolio.getExclusions()).toEqual(["alpha", "scriptbeta/script"]);
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

  it("accepts valid contact messages and silently absorbs honeypot spam", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const slug = `contact-project-${Date.now()}`;
    await caller.portfolio.updatePublishing({ slug, isPublic: true });
    await expect(caller.portfolio.submitContact({ slug, senderName: "Taylor", senderEmail: "Taylor@example.com", message: "I would like to discuss the project and collaboration details.", startedAt: Date.now() - 5000 })).resolves.toEqual({ accepted: true });
    await expect(caller.portfolio.submitContact({ slug, senderName: "Bot", senderEmail: "bot@example.com", message: "This message should be absorbed by the honeypot.", website: "https://spam.example", startedAt: Date.now() - 5000 })).resolves.toEqual({ accepted: true });
  });

  it("rate limits repeated contact submissions per profile and client", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const slug = `rate-project-${Date.now()}`;
    await caller.portfolio.updatePublishing({ slug, isPublic: true });
    const input = { slug, senderName: "Taylor", senderEmail: "taylor@example.com", message: "This is a sufficiently long contact message for testing." };
    for (let index = 0; index < 5; index += 1) await expect(caller.portfolio.submitContact(input)).resolves.toEqual({ accepted: true });
    await expect(caller.portfolio.submitContact(input)).rejects.toThrow("Please wait before sending another message.");
  });

  it("persists sanitized endorsement links through profile copy", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const slug = `endorsement-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await caller.portfolio.updatePublishing({ slug, isPublic: true });
    await caller.portfolio.updateProfileCopy({ slug, endorsements: [{ name: "Taylor", quote: "A careful builder who communicates clearly.", url: "https://example.com/taylor" }] });
    const profile = await caller.portfolio.myProfile();
    expect((profile as any)?.sectionConfig?.content?.endorsements).toEqual([{ name: "Taylor", quote: "A careful builder who communicates clearly.", url: "https://example.com/taylor" }]);
  });

  it("persists safe public recommendation links through profile copy", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const slug = `recommendation-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await caller.portfolio.updatePublishing({ slug, isPublic: true });
    await caller.portfolio.updateProfileCopy({ slug, recommendations: [{ label: "Design notes", url: "https://example.com/notes" }] });
    const profile = await caller.portfolio.myProfile();
    expect((profile as any)?.sectionConfig?.content?.recommendations).toEqual([{ label: "Design notes", url: "https://example.com/notes" }]);
  });

  it("persists duplicate-safe newsletter subscriptions and unsubscribe lifecycle", async () => {
    const caller = appRouter.createCaller(authenticatedContext());
    const slug = `newsletter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `reader-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    await caller.portfolio.updatePublishing({ slug, isPublic: true });
    const first = await caller.portfolio.subscribeNewsletter({ slug, email });
    expect(first.status).toBe("subscribed");
    const duplicate = await caller.portfolio.subscribeNewsletter({ slug, email: email.toUpperCase() });
    expect(duplicate.status).toBe("already-subscribed");
    await expect(caller.portfolio.unsubscribeNewsletter({ token: first.unsubscribeToken! })).resolves.toEqual({ status: "unsubscribed" });
    const reactivated = await caller.portfolio.subscribeNewsletter({ slug, email });
    expect(reactivated.status).toBe("already-subscribed");
  });

  it("persists bounded AI generation audit records without exposing prompt content", async () => {
    localSet("githubConnection:fallback-test-user", { login: "audit-project" });
    localSet("profile:audit-project", { slug: "audit-project", isPublic: true, sectionConfig: { order: ["Hero introduction"], aiGenerationAudit: [] }, repositories: [] });
    const caller = appRouter.createCaller(authenticatedContext());
    await caller.portfolio.updatePublishing({ slug: "audit-project", isPublic: true });
    await caller.portfolio.recordAiGeneration({ slug: "audit-project", action: "summary", status: "draft", repositoryName: "<b>repo</b>" });
    await caller.portfolio.recordAiGeneration({ slug: "audit-project", action: "summary", status: "approved", repositoryName: "repo" });
    await caller.portfolio.recordAiGeneration({ slug: "audit-project", action: "summary", status: "rejected", repositoryName: "repo" });
    const profile = await caller.portfolio.bySlug({ slug: "audit-project" });
    expect((profile?.sectionConfig as any).aiGenerationAudit).toMatchObject([{ action: "summary", status: "rejected" }, { action: "summary", status: "approved" }, { action: "summary", status: "draft", repositoryName: "brepo/b" }]);
    expect(JSON.stringify(profile?.sectionConfig)).not.toContain("prompt");
  });

  it("persists repository-backed project image metadata through the public profile", async () => {
    localSet("githubConnection:fallback-test-user", { login: "repo-image-project" });
    localSet("profile:repo-image-project", { slug: "repo-image-project", isPublic: true, repositories: [{ id: 42, name: "repo-image", description: "Repository project", imageUrl: null }] });
    const caller = appRouter.createCaller(authenticatedContext());
    const publicCaller = appRouter.createCaller(publicContext());
    await caller.portfolio.updateRepository({ id: 42, displayName: "Repository Image Showcase", topics: ["TypeScript", "developer-tools", "TypeScript"], aiSummary: "An approved repository summary.", imageUrl: "/manus-storage/project-images/repo-cover.png", imageKey: "project-images/repo-cover.png", imageAlt: "A repository cover", imageCrop: { x: 25, y: 70, scale: 1.4 } });
    const profile = await publicCaller.portfolio.bySlug({ slug: "repo-image-project" });
    expect(profile?.repositories?.[0]).toMatchObject({ displayName: "Repository Image Showcase", topics: ["typescript", "developer-tools"], aiSummary: "An approved repository summary.", imageUrl: "/manus-storage/project-images/repo-cover.png", imageKey: "project-images/repo-cover.png", imageAlt: "A repository cover", imageCrop: { x: 25, y: 70, scale: 1.4 } });
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

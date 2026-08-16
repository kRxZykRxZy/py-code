import { randomBytes } from "node:crypto";
import { eq, desc, gte, and } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { getDb } from "./db";
import { analyticsEvents, customDomains, githubConnections, profiles, repositories, subscriptions, users } from "../drizzle/schema";
import { generatePortfolioNarrative, getGitHubProfile, getGitHubRepos, integrationConfig, summarizeRepository } from "./integrations";
import { validatePortfolioCss } from "./customCss";
import { sanitizeHttpUrl, sanitizePlainText } from "./sanitization";
import { localDelete, localDeleteByPrefix, localGet, localSet } from "./localStore";
import { storagePut } from "./storage";

const demoProfile = { slug: "alexmorgan", displayName: "Alex Morgan", githubLogin: "alexmorgan", bio: "Product-minded engineer focused on interfaces, developer tools, and systems that help good ideas become useful things.", avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4", location: "London, UK", template: "atelier", isPublic: true, repositories: [{ name: "orbit-ui", description: "A small, intentional component system for expressive product interfaces.", language: "TypeScript", stars: 184, forks: 19, aiSummary: "A thoughtful UI foundation that balances accessible primitives with a strong visual point of view.", isPinned: true }, { name: "signal-cache", description: "Fast, typed caching for edge-first applications.", language: "Rust", stars: 92, forks: 8, aiSummary: "A compact caching layer designed for predictable performance and composable invalidation.", isPinned: true }] };
const customDomainSchema = z.string().trim().toLowerCase().min(4).max(253).regex(/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a valid hostname such as portfolio.example.com");
const planUsageLimits = { free: { aiSummaries: 3, customCssChars: 0 }, pro: { aiSummaries: 20, customCssChars: 2_000 }, proPlus: { aiSummaries: null, customCssChars: 20_000 } } as const;
function effectivePlan(subscription: any) { return subscription?.status === "active" && subscription.plan !== "free" ? subscription.plan as "pro" | "proPlus" : "free"; }
function createPreviewToken() { return randomBytes(24).toString("base64url"); }
function withDetailNarratives(profile: any) { if (!profile) return profile; const sectionConfig = typeof profile.sectionConfig === "string" ? (() => { try { return JSON.parse(profile.sectionConfig); } catch { return {}; } })() : profile.sectionConfig; if (!profile.repositories) return { ...profile, sectionConfig }; return { ...profile, sectionConfig, repositories: profile.repositories.map((repo: any) => ({ ...repo, updatedAt: repo.updatedAt || repo.lastActivityAt || null, detailNarrative: repo.detailNarrative || `${repo.aiSummary || repo.description || "This project demonstrates a considered approach to building useful software."} It combines ${repo.language || "software"} craft with the practical constraints reflected in ${repo.stars || 0} stars and ${repo.forks || 0} forks.` })) }; }

export const appRouter = router({
  system: systemRouter,
  auth: router({ me: publicProcedure.query(opts => opts.ctx.user), logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }) }),
  integrations: publicProcedure.query(() => integrationConfig),
  github: router({
    connection: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const connection = db ? (await db.select().from(githubConnections).where(eq(githubConnections.userId, ctx.user.id)).limit(1))[0] : localGet<{ githubId: string; scope?: string | null; login?: string; updatedAt?: number } | null>(`githubConnection:${ctx.user.openId}`, null);
      if (!connection) return { connected: false, login: null, scopes: [], updatedAt: null };
      return { connected: true, login: "login" in connection ? connection.login ?? null : null, scopes: (connection.scope || "").split(",").filter(Boolean), updatedAt: "updatedAt" in connection ? connection.updatedAt : null };
    }),
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (db) await db.delete(githubConnections).where(eq(githubConnections.userId, ctx.user.id));
      else localSet(`githubConnection:${ctx.user.openId}`, null);
      return { disconnected: true } as const;
    }),
  }),
  account: router({
    exportData: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        const connection = localGet<{ githubId?: string; login?: string; scope?: string } | null>(`githubConnection:${ctx.user.openId}`, null);
        const slug = connection?.login?.toLowerCase();
        return { exportedAt: new Date().toISOString(), account: { name: ctx.user.name, email: ctx.user.email, loginMethod: ctx.user.loginMethod }, githubConnection: connection ? { githubId: connection.githubId || null, login: connection.login || null, scope: connection.scope || null } : null, profile: slug ? localGet(`profile:${slug}`, null) : null, domains: localGet(`domains:${ctx.user.id}`, []), notificationPreferences: localGet(`notifications:${ctx.user.id}`, null), billing: localGet(`billing:${ctx.user.id}`, null) };
      }
      const profile = (await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1))[0] || null;
      const [connection, subscription] = await Promise.all([
        db.select({ githubId: githubConnections.githubId, scope: githubConnections.scope, syncedAt: githubConnections.syncedAt, createdAt: githubConnections.createdAt, updatedAt: githubConnections.updatedAt }).from(githubConnections).where(eq(githubConnections.userId, ctx.user.id)).limit(1),
        db.select().from(subscriptions).where(eq(subscriptions.userId, ctx.user.id)).limit(1),
      ]);
      const [repoRows, domainRows, eventRows] = profile ? await Promise.all([
        db.select().from(repositories).where(eq(repositories.profileId, profile.id)),
        db.select().from(customDomains).where(eq(customDomains.profileId, profile.id)),
        db.select().from(analyticsEvents).where(eq(analyticsEvents.profileId, profile.id)),
      ]) : [[], [], []];
      return { exportedAt: new Date().toISOString(), account: { name: ctx.user.name, email: ctx.user.email, loginMethod: ctx.user.loginMethod }, githubConnection: connection[0] || null, profile, repositories: repoRows, domains: domainRows, analyticsEvents: eventRows, subscription: subscription[0] || null };
    }),
    deleteAccount: protectedProcedure.input(z.object({ confirmation: z.literal("DELETE MY ACCOUNT") })).mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        const connection = localGet<{ login?: string } | null>(`githubConnection:${ctx.user.openId}`, null);
        const slug = connection?.login?.toLowerCase();
        localDelete(`githubConnection:${ctx.user.openId}`);
        localDelete(`billing:${ctx.user.id}`);
        localDelete(`domains:${ctx.user.id}`);
        localDelete(`notifications:${ctx.user.id}`);
        if (slug) { localDelete(`profile:${slug}`); localDeleteByPrefix(`analytics:${slug}`); }
        localDeleteByPrefix(`repo:${ctx.user.openId}:`);
      } else {
        const profile = (await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1))[0];
        if (profile) {
          await db.delete(analyticsEvents).where(eq(analyticsEvents.profileId, profile.id));
          await db.delete(repositories).where(eq(repositories.profileId, profile.id));
          await db.delete(customDomains).where(eq(customDomains.profileId, profile.id));
          await db.delete(profiles).where(eq(profiles.id, profile.id));
        }
        await db.delete(githubConnections).where(eq(githubConnections.userId, ctx.user.id));
        await db.delete(subscriptions).where(eq(subscriptions.userId, ctx.user.id));
        await db.delete(users).where(eq(users.id, ctx.user.id));
      }
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { deleted: true } as const;
    }),
  }),
  portfolio: router({
    bySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(80), previewToken: z.string().max(120).optional() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) { const profile = localGet<any>(`profile:${input.slug}`, input.slug === demoProfile.slug ? demoProfile : null); return profile && (profile.isPublic === true || Boolean(input.previewToken) && profile.previewToken === input.previewToken) ? withDetailNarratives(profile) : null; }
      const result = await db.select().from(profiles).where(eq(profiles.slug, input.slug)).limit(1);
      if (!result[0]) { const fallback = localGet<any>(`profile:${input.slug}`, input.slug === demoProfile.slug ? demoProfile : null); return fallback && (fallback.isPublic === true || Boolean(input.previewToken) && fallback.previewToken === input.previewToken) ? withDetailNarratives(fallback) : null; }
      if (!result[0].isPublic && result[0].previewToken !== input.previewToken) return input.slug === demoProfile.slug ? demoProfile : null;
      const rows = await db.select().from(repositories).where(eq(repositories.profileId, result[0].id)).orderBy(repositories.sortOrder);
      return withDetailNarratives({ ...result[0], repositories: rows.filter(r => !r.isHidden) });
    }),
    myProfile: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (db) { const profile = (await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1))[0]; if (!profile) return null; const rows = await db.select().from(repositories).where(eq(repositories.profileId, profile.id)).orderBy(repositories.sortOrder); return { ...profile, repositories: rows }; }
      const connection = localGet<{ login?: string } | null>(`githubConnection:${ctx.user.openId}`, null);
      return connection?.login ? localGet(`profile:${connection.login.toLowerCase()}`, null) : null;
    }),
    previewLink: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (db) { const profile = (await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1))[0]; if (!profile) return null; const token = profile.previewToken || createPreviewToken(); if (!profile.previewToken) await db.update(profiles).set({ previewToken: token }).where(eq(profiles.userId, ctx.user.id)); return { slug: profile.slug, token, isPublic: profile.isPublic }; }
      const connection = localGet<{ login?: string } | null>(`githubConnection:${ctx.user.openId}`, null); const slug = connection?.login?.toLowerCase(); if (!slug) return null; const profile = localGet<any>(`profile:${slug}`, null); if (!profile) return null; const token = profile.previewToken || createPreviewToken(); if (!profile.previewToken) localSet(`profile:${slug}`, { ...profile, previewToken: token }); return { slug, token, isPublic: Boolean(profile.isPublic) };
    }),
    saveSettings: protectedProcedure.input(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), template: z.string(), customCss: z.string().max(20000), isPublic: z.boolean() })).mutation(async ({ ctx, input }) => { const db = await getDb(); const cssError = validatePortfolioCss(input.customCss); if (cssError) throw new TRPCError({ code: "BAD_REQUEST", message: cssError }); if (input.customCss.trim()) { const subscription = db ? (await db.select().from(subscriptions).where(eq(subscriptions.userId, ctx.user.id)).limit(1))[0] : localGet<any>(`billing:${ctx.user.id}`, { plan: "free", status: "inactive" }); if (!subscription || subscription.plan === "free" || subscription.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "An active Pro or Pro+ plan is required to save custom CSS" }); if (subscription.plan === "pro" && input.customCss.length > 2000) throw new TRPCError({ code: "FORBIDDEN", message: "Pro supports up to 2,000 characters of custom CSS; upgrade to Pro+ for 20,000" }); } if (!db) { const existing = localGet<any>(`profile:${input.slug}`, null); localSet(`profile:${input.slug}`, { ...demoProfile, ...existing, ...input, slug: input.slug, previewToken: existing?.previewToken || createPreviewToken() }); return input; } const existing = await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1); if (existing[0]) await db.update(profiles).set(input).where(eq(profiles.userId, ctx.user.id)); else { const localExisting = localGet<any>(`profile:${input.slug}`, null); await db.insert(profiles).values({ userId: ctx.user.id, slug: input.slug, githubLogin: input.slug, displayName: ctx.user.name || input.slug, isPublic: input.isPublic, template: input.template, customCss: input.customCss, previewToken: localExisting?.previewToken || createPreviewToken() }); } return input; }),
    updatePublishing: protectedProcedure.input(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), isPublic: z.boolean() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) { const existing = localGet<any>(`profile:${input.slug}`, null); localSet(`profile:${input.slug}`, { ...demoProfile, ...existing, ...input, slug: input.slug, previewToken: existing?.previewToken || createPreviewToken() }); return input; } const existing = await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1); if (existing[0]) await db.update(profiles).set({ ...input, previewToken: existing[0].previewToken || createPreviewToken() }).where(eq(profiles.userId, ctx.user.id)); else await db.insert(profiles).values({ userId: ctx.user.id, slug: input.slug, githubLogin: input.slug, displayName: ctx.user.name || input.slug, isPublic: input.isPublic, previewToken: createPreviewToken() }); return input; }),
    updateSectionConfig: protectedProcedure.input(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), sectionConfig: z.object({ order: z.array(z.string().max(80)).min(1).max(20), visibility: z.record(z.string(), z.boolean()).optional() }) })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) { localSet(`profile:${input.slug}`, { ...localGet(`profile:${input.slug}`, demoProfile), sectionConfig: input.sectionConfig, slug: input.slug }); return input.sectionConfig; } const existing = (await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1))[0]; if (existing) await db.update(profiles).set({ sectionConfig: input.sectionConfig }).where(eq(profiles.userId, ctx.user.id)); else await db.insert(profiles).values({ userId: ctx.user.id, slug: input.slug, githubLogin: input.slug, displayName: ctx.user.name || input.slug, sectionConfig: input.sectionConfig }); return input.sectionConfig; }),
    updateProfileCopy: protectedProcedure.input(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), displayName: z.string().max(360).optional(), bio: z.string().max(8_000).optional(), headline: z.string().max(180).optional(), tagline: z.string().max(240).optional(), timezone: z.string().max(80).optional(), availabilityStatus: z.string().max(120).optional(), currentFocus: z.string().max(240).optional(), nowStatus: z.string().max(240).optional(), learningStatus: z.string().max(240).optional(), writingNotes: z.array(z.object({ title: z.string().max(160), url: z.string().max(2048), publishedAt: z.string().max(40).optional(), sortOrder: z.number().int().min(0).max(50) })).max(20).optional(), manualProjects: z.array(z.object({ title: z.string().max(160), description: z.string().max(1000), tags: z.array(z.string().max(40)).max(12), url: z.string().max(2048).optional(), imageUrl: z.string().max(2048).optional(), imageKey: z.string().max(512).optional(), imageAlt: z.string().max(180).optional(), imageCrop: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100), scale: z.number().min(1).max(3) }).optional(), visible: z.boolean(), sortOrder: z.number().int().min(0).max(50) })).max(30).optional(), location: z.string().max(360).optional(), websiteUrl: z.string().max(2_048).optional() })).mutation(async ({ ctx, input }) => {
      const values = {
        ...(input.displayName !== undefined ? { displayName: sanitizePlainText(input.displayName, 180) } : {}),
        ...(input.bio !== undefined ? { bio: sanitizePlainText(input.bio, 3_000) } : {}),
        ...(input.location !== undefined ? { location: sanitizePlainText(input.location, 180) } : {}),
        ...(input.websiteUrl !== undefined ? { websiteUrl: sanitizeHttpUrl(input.websiteUrl) } : {}),
      };
      const content = { ...(input.headline !== undefined ? { headline: sanitizePlainText(input.headline, 180) } : {}), ...(input.tagline !== undefined ? { tagline: sanitizePlainText(input.tagline, 240) } : {}), ...(input.timezone !== undefined ? { timezone: sanitizePlainText(input.timezone, 80) } : {}), ...(input.availabilityStatus !== undefined ? { availabilityStatus: sanitizePlainText(input.availabilityStatus, 120) } : {}), ...(input.currentFocus !== undefined ? { currentFocus: sanitizePlainText(input.currentFocus, 240) } : {}), ...(input.nowStatus !== undefined ? { nowStatus: sanitizePlainText(input.nowStatus, 240) } : {}), ...(input.learningStatus !== undefined ? { learningStatus: sanitizePlainText(input.learningStatus, 240) } : {}), ...(input.writingNotes !== undefined ? { writingNotes: input.writingNotes.map((note) => ({ title: sanitizePlainText(note.title, 160), url: sanitizeHttpUrl(note.url) || "", publishedAt: note.publishedAt ? sanitizePlainText(note.publishedAt, 40) : undefined, sortOrder: note.sortOrder })).filter((note) => note.title && note.url) } : {}), ...(input.manualProjects !== undefined ? { manualProjects: input.manualProjects.map((project) => ({ title: sanitizePlainText(project.title, 160), description: sanitizePlainText(project.description, 1000), tags: project.tags.map((tag) => sanitizePlainText(tag, 40)).filter(Boolean), url: project.url ? sanitizeHttpUrl(project.url) || undefined : undefined, imageUrl: project.imageUrl ? (project.imageUrl.startsWith("/manus-storage/") ? project.imageUrl : sanitizeHttpUrl(project.imageUrl) || undefined) : undefined, imageKey: project.imageKey ? sanitizePlainText(project.imageKey, 512) : undefined, imageAlt: project.imageAlt ? sanitizePlainText(project.imageAlt, 180) : undefined, imageCrop: project.imageCrop || { x: 50, y: 50, scale: 1 }, visible: project.visible, sortOrder: project.sortOrder })).filter((project) => project.title && project.description) } : {}) };
      if (input.websiteUrl !== undefined && input.websiteUrl.trim() && !values.websiteUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Website URL must use http or https" });
      if (input.writingNotes?.some((note) => !sanitizeHttpUrl(note.url))) throw new TRPCError({ code: "BAD_REQUEST", message: "Writing note links must use http or https" }); if (input.manualProjects?.some((project) => project.url?.trim() && !sanitizeHttpUrl(project.url))) throw new TRPCError({ code: "BAD_REQUEST", message: "Manual project links must use http or https" });
      const db = await getDb();
      if (!db) { const existing = localGet<any>(`profile:${input.slug}`, demoProfile); localSet(`profile:${input.slug}`, { ...existing, ...values, slug: input.slug, sectionConfig: { ...(existing.sectionConfig || {}), content: { ...(existing.sectionConfig?.content || {}), ...content } } }); return { ...values, content }; }
      const existing = (await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1))[0];
      if (existing) await db.update(profiles).set({ ...values, sectionConfig: { ...((existing.sectionConfig as any) || {}), content: { ...(((existing.sectionConfig as any)?.content || {})), ...content } } }).where(eq(profiles.userId, ctx.user.id));
      else await db.insert(profiles).values({ userId: ctx.user.id, slug: input.slug, githubLogin: input.slug, displayName: values.displayName || ctx.user.name || input.slug, bio: values.bio || null, location: values.location || null, websiteUrl: values.websiteUrl || null, sectionConfig: { content } });
      return { ...values, content };
    }),
    uploadProjectImage: protectedProcedure.input(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), projectIndex: z.number().int().min(0).max(30).optional(), repositoryId: z.number().int().positive().optional(), fileName: z.string().max(160), mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]), dataUrl: z.string().max(2_200_000), altText: z.string().max(180).optional(), crop: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100), scale: z.number().min(1).max(3) }).optional() })).mutation(async ({ ctx, input }) => { const match = input.dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/); if (!match || match[1] !== input.mimeType) throw new TRPCError({ code: "BAD_REQUEST", message: "Upload a valid JPEG, PNG, WebP, or GIF image" }); const buffer = Buffer.from(match[2], "base64"); if (buffer.length > 1_500_000) throw new TRPCError({ code: "BAD_REQUEST", message: "Project images must be 1.5 MB or smaller" }); const safeName = input.fileName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(-100) || "project-image"; try { const stored = await storagePut(`project-images/${ctx.user.id}/${input.slug}/${safeName}`, buffer, input.mimeType); return { ...stored, altText: input.altText ? sanitizePlainText(input.altText, 180) : "", crop: input.crop || { x: 50, y: 50, scale: 1 } }; } catch (error) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Project image upload failed" }); } }),
    generateNarrative: protectedProcedure.input(z.object({ bio: z.string().max(4000).optional(), repositories: z.array(z.object({ name: z.string().max(120), description: z.string().max(2000).nullable().optional(), language: z.string().max(80).nullable().optional() })).max(20) })).mutation(async ({ input }) => generatePortfolioNarrative(input)),
    updateRepository: protectedProcedure.input(z.object({ id: z.number(), imageUrl: z.string().max(2048).optional(), imageKey: z.string().max(512).optional(), imageAlt: z.string().max(180).optional(), imageCrop: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100), scale: z.number().min(1).max(3) }).optional(), displayName: z.string().max(360).optional(), displayDescription: z.string().max(4_000).optional(), isPinned: z.boolean().optional(), isHidden: z.boolean().optional(), sortOrder: z.number().optional() })).mutation(async ({ ctx, input }) => { const db = await getDb(); const values = { ...input, ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl.startsWith("/manus-storage/") ? input.imageUrl : sanitizeHttpUrl(input.imageUrl) || null } : {}), ...(input.imageAlt !== undefined ? { imageAlt: sanitizePlainText(input.imageAlt, 180) } : {}), ...(input.imageKey !== undefined ? { imageKey: sanitizePlainText(input.imageKey, 512) } : {}), ...(input.displayName !== undefined ? { displayName: sanitizePlainText(input.displayName, 180) } : {}), ...(input.displayDescription !== undefined ? { displayDescription: sanitizePlainText(input.displayDescription, 2_000) } : {}) }; if (input.imageUrl !== undefined && input.imageUrl.trim() && !values.imageUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Project image URLs must use http or https or internal storage" }); if (db) { const result = await db.update(repositories).set(values).where(eq(repositories.id, input.id)); if ((result as any)?.affectedRows === 0) localSet(`repo:${ctx.user.openId}:${input.id}`, values); } else { localSet(`repo:${ctx.user.openId}:${input.id}`, values); const connection = localGet<{ login?: string } | null>(`githubConnection:${ctx.user.openId}`, null); const slug = connection?.login?.toLowerCase(); const profile = slug ? localGet<any>(`profile:${slug}`, null) : null; if (profile?.repositories) { const index = profile.repositories.findIndex((repo: any) => Number(repo.id) === input.id); if (index >= 0) { profile.repositories[index] = { ...profile.repositories[index], ...values }; profile.repositories.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)); localSet(`profile:${slug}`, profile); } } } const connection = localGet<{ login?: string } | null>(`githubConnection:${ctx.user.openId}`, null); const slug = connection?.login?.toLowerCase(); const profile = slug ? localGet<any>(`profile:${slug}`, null) : null; if (profile?.repositories) { const index = profile.repositories.findIndex((repo: any) => Number(repo.id) === input.id); if (index >= 0) { profile.repositories[index] = { ...profile.repositories[index], ...values }; localSet(`profile:${slug}`, profile); } } return { success: true }; }),
    syncGitHub: protectedProcedure.input(z.object({ accessToken: z.string().min(1).optional() }).optional()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const connection = db ? (await db.select().from(githubConnections).where(eq(githubConnections.userId, ctx.user.id)).limit(1))[0] : localGet<{ accessToken?: string } | null>(`githubConnection:${ctx.user.openId}`, null);
      const accessToken = input?.accessToken || connection?.accessToken;
      if (!accessToken) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Sign in with GitHub before syncing your portfolio" });
      const profile = await getGitHubProfile(accessToken);
      const repos = await getGitHubRepos(accessToken);
      if (db) {
        const existing = await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1);
        let profileId = existing[0]?.id;
        if (existing[0]) {
          await db.update(profiles).set({ githubLogin: profile.login, githubId: String(profile.id), displayName: profile.name || profile.login, bio: profile.bio, avatarUrl: profile.avatar_url, location: profile.location, websiteUrl: profile.blog }).where(eq(profiles.userId, ctx.user.id));
        } else {
          const inserted = await db.insert(profiles).values({ userId: ctx.user.id, slug: profile.login.toLowerCase(), githubLogin: profile.login, githubId: String(profile.id), displayName: profile.name || profile.login, bio: profile.bio, avatarUrl: profile.avatar_url, location: profile.location, websiteUrl: profile.blog });
          profileId = Number(inserted[0].insertId);
        }
        if (profileId) {
          for (let index = 0; index < repos.length; index++) {
            const repo = repos[index];
            const aiSummary = await summarizeRepository(repo);
            await db.insert(repositories).values({ profileId, githubRepoId: String(repo.id), name: repo.name, description: repo.description, language: repo.language, stars: repo.stargazers_count, forks: repo.forks_count, url: repo.html_url, homepage: repo.homepage, aiSummary, sortOrder: index, lastActivityAt: repo.updated_at ? new Date(repo.updated_at) : null }).onDuplicateKeyUpdate({ set: { description: repo.description, language: repo.language, stars: repo.stargazers_count, forks: repo.forks_count, aiSummary, lastActivityAt: repo.updated_at ? new Date(repo.updated_at) : null } });
          }
        }
      } else {
        localSet(`profile:${profile.login.toLowerCase()}`, { ...demoProfile, slug: profile.login.toLowerCase(), githubLogin: profile.login, displayName: profile.name || profile.login, bio: profile.bio, avatarUrl: profile.avatar_url, location: profile.location, websiteUrl: profile.blog, repositories: repos.map((repo, index) => ({ id: repo.id, name: repo.name, description: repo.description, language: repo.language, stars: repo.stargazers_count, forks: repo.forks_count, aiSummary: null, isPinned: false, sortOrder: index, updatedAt: repo.updated_at || null })) });
      }
      return { profile: { login: profile.login, name: profile.name }, repositories: repos.length };
    }),
    regenerateSummaries: protectedProcedure.input(z.object({ repositoryIds: z.array(z.number().int().positive()).max(50).optional(), tone: z.enum(["thoughtful", "technical", "playful"]).default("thoughtful"), length: z.enum(["short", "standard", "detailed"]).default("standard") }).optional()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const settings = { tone: input?.tone ?? "thoughtful", length: input?.length ?? "standard" } as const;
      const subscription = db ? (await db.select().from(subscriptions).where(eq(subscriptions.userId, ctx.user.id)).limit(1))[0] : localGet<any>(`billing:${ctx.user.id}`, { plan: "free", status: "inactive" });
      const summaryLimit = planUsageLimits[effectivePlan(subscription)].aiSummaries;
      if (db) {
        const profile = (await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1))[0];
        if (!profile) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Sync GitHub before regenerating project summaries" });
        const rows = await db.select().from(repositories).where(eq(repositories.profileId, profile.id));
        const requestedTargets = input?.repositoryIds?.length ? rows.filter((row) => input.repositoryIds!.includes(row.id)) : rows;
        let remainingNewSummaries = summaryLimit === null ? Number.POSITIVE_INFINITY : Math.max(0, summaryLimit - rows.filter(row => Boolean(row.aiSummary)).length);
        const targets = requestedTargets.filter(row => Boolean(row.aiSummary) || remainingNewSummaries-- > 0);
        for (const repo of targets) {
          const aiSummary = await summarizeRepository(repo, settings);
          await db.update(repositories).set({ aiSummary, syncedAt: new Date() }).where(eq(repositories.id, repo.id));
        }
        return { regenerated: targets.length };
      }
      const connection = localGet<{ login?: string } | null>(`githubConnection:${ctx.user.openId}`, null);
      const slug = connection?.login?.toLowerCase();
      const localProfile = slug ? localGet<any>(`profile:${slug}`, null) : null;
      if (!localProfile?.repositories?.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Sync GitHub before regenerating project summaries" });
      let remainingNewSummaries = summaryLimit === null ? Number.POSITIVE_INFINITY : Math.max(0, summaryLimit - localProfile.repositories.filter((repo: any) => Boolean(repo.aiSummary)).length);
      const refreshedRepositories = [];
      for (const repo of localProfile.repositories) refreshedRepositories.push(Boolean(repo.aiSummary) || remainingNewSummaries-- > 0 ? { ...repo, aiSummary: await summarizeRepository(repo, settings) } : repo);
      localSet(`profile:${slug}`, { ...localProfile, repositories: refreshedRepositories });
      return { regenerated: refreshedRepositories.filter((repo: any) => Boolean(repo.aiSummary)).length };
    }),
  }),
  analytics: router({ record: publicProcedure.input(z.object({ slug: z.string(), referrer: z.string().optional(), country: z.string().optional(), region: z.string().optional(), visitorHash: z.string().optional(), utmSource: z.string().optional(), utmMedium: z.string().optional(), utmCampaign: z.string().optional(), consent: z.boolean().default(true) })).mutation(async ({ input }) => { if (!input.consent) return { ok: true, recorded: false }; const db = await getDb(); if (db) { const profile = await db.select().from(profiles).where(eq(profiles.slug, input.slug)).limit(1); if (profile[0] && profile[0].analyticsConsent) await db.insert(analyticsEvents).values({ profileId: profile[0].id, referrer: input.referrer, country: input.country, region: input.region, visitorHash: input.visitorHash, utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign }); } else { const events = localGet<any[]>(`analytics:${input.slug}`, []); localSet(`analytics:${input.slug}`, [...events, { ...input, createdAt: Date.now() }]); } return { ok: true, recorded: true }; }), summary: protectedProcedure.input(z.object({ days: z.number().min(1).max(365).default(30) }).optional()).query(async ({ ctx, input }) => { const days = input?.days ?? 30; const cutoff = Date.now() - days * 86400000; const db = await getDb(); if (!db) { const events = localGet<any[]>("analytics:alexmorgan", []).filter((event) => Number(event.createdAt) >= cutoff); const referrals = Object.entries(events.reduce<Record<string, number>>((acc, event) => { const key = [event.utmSource, event.utmMedium, event.utmCampaign].filter(Boolean).join(" / ") || event.referrer || "direct"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })); return { totalViews: events.length, uniqueVisitors: new Set(events.map((event) => event.visitorHash).filter(Boolean)).size, countries: Object.entries(events.reduce<Record<string, number>>((acc, event) => { const key = event.country || "Unknown"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })), regions: Object.entries(events.reduce<Record<string, number>>((acc, event) => { const key = event.region || "Unknown"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })), referrals, timeseries: events.map(() => 1), series: events.map((event) => ({ date: new Date(Number(event.createdAt)).toISOString().slice(0, 10), views: 1 })) }; } const profile = await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1); if (!profile[0]) return { totalViews: 0, uniqueVisitors: 0, countries: [], regions: [], referrals: [], timeseries: [] }; const events = await db.select().from(analyticsEvents).where(and(eq(analyticsEvents.profileId, profile[0].id), gte(analyticsEvents.createdAt, new Date(Date.now() - (input?.days ?? 30) * 86400000)))); const referrals = Object.entries(events.reduce<Record<string, number>>((acc, event) => { const key = [event.utmSource, event.utmMedium, event.utmCampaign].filter(Boolean).join(" / ") || event.referrer || "direct"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })); return { totalViews: events.length, uniqueVisitors: new Set(events.map(e => e.visitorHash).filter(Boolean)).size, countries: Object.entries(events.reduce<Record<string, number>>((acc, event) => { const key = event.country || "Unknown"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })), regions: Object.entries(events.reduce<Record<string, number>>((acc, event) => { const key = event.region || "Unknown"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })), referrals, timeseries: events.map(() => 1), series: events.map((event) => ({ date: new Date(event.createdAt).toISOString().slice(0, 10), views: 1 })) }; }) }),
  notifications: router({ get: protectedProcedure.query(async ({ ctx }) => localGet(`notifications:${ctx.user.id}`, { browser: "default", analytics: true, digest: true })), update: protectedProcedure.input(z.object({ browser: z.enum(["default", "granted", "denied"]).optional(), analytics: z.boolean().optional(), digest: z.boolean().optional() })).mutation(async ({ ctx, input }) => { const current = localGet(`notifications:${ctx.user.id}`, { browser: "default", analytics: true, digest: true }); const next = { ...current, ...input }; localSet(`notifications:${ctx.user.id}`, next); return next; }) }),
  billing: router({
    status: protectedProcedure.query(async ({ ctx }) => { const db = await getDb(); if (!db) return localGet(`billing:${ctx.user.id}`, { plan: "free", status: "inactive", managedDomainAddOn: false, managedDomainName: null, managedDomainStatus: "none" }); const row = await db.select().from(subscriptions).where(eq(subscriptions.userId, ctx.user.id)).limit(1); return row[0] || { plan: "free", status: "inactive", managedDomainAddOn: false, managedDomainName: null, managedDomainStatus: "none" }; }),
    customerPortal: protectedProcedure.query(async () => ({ configured: Boolean(process.env.PADDLE_CUSTOMER_PORTAL_URL), url: process.env.PADDLE_CUSTOMER_PORTAL_URL || null })),
    usage: protectedProcedure.query(async ({ ctx }) => { const db = await getDb(); const subscription = db ? (await db.select().from(subscriptions).where(eq(subscriptions.userId, ctx.user.id)).limit(1))[0] : localGet<any>(`billing:${ctx.user.id}`, { plan: "free", status: "inactive" }); const plan = effectivePlan(subscription); const limits = planUsageLimits[plan]; if (db) { const profile = (await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1))[0]; const rows = profile ? await db.select().from(repositories).where(eq(repositories.profileId, profile.id)) : []; return { plan, limits, usage: { repositories: rows.length, aiSummaries: rows.filter(row => Boolean(row.aiSummary)).length, customCssChars: profile?.customCss?.length || 0 } }; } const connection = localGet<{ login?: string } | null>(`githubConnection:${ctx.user.openId}`, null); const profile = connection?.login ? localGet<any>(`profile:${connection.login.toLowerCase()}`, null) : null; const repos = profile?.repositories || []; return { plan, limits, usage: { repositories: repos.length, aiSummaries: repos.filter((repo: any) => Boolean(repo.aiSummary)).length, customCssChars: profile?.customCss?.length || 0 } }; }),
    createCheckout: protectedProcedure.input(z.object({ plan: z.enum(["pro", "proPlus"]), managedDomainAddOn: z.boolean().default(false) })).mutation(async ({ input }) => ({ checkoutUrl: process.env.PADDLE_CHECKOUT_URL || null, configured: Boolean(process.env.PADDLE_API_KEY && process.env.PADDLE_PRICE_ID), lineItems: [{ name: input.plan === "pro" ? "GitHubFolio Pro — $12/month" : "GitHubFolio Pro+ — $18/month", amount: input.plan === "pro" ? 12 : 18 }, ...(input.managedDomainAddOn ? [{ name: "Managed domain add-on — $3/month", amount: 3 }] : [])] })),
    requestManagedDomain: protectedProcedure.input(z.object({ domain: customDomainSchema })).mutation(async ({ ctx, input }) => { const db = await getDb(); const current = db ? (await db.select().from(subscriptions).where(eq(subscriptions.userId, ctx.user.id)).limit(1))[0] : localGet<any>(`billing:${ctx.user.id}`, { plan: "free", status: "inactive" }); if (!current || current.plan === "free" || current.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "An active Pro or Pro+ plan is required for managed domains" }); const values = { managedDomainAddOn: true, managedDomainName: input.domain, managedDomainStatus: "requested" as const }; if (db) await db.update(subscriptions).set(values).where(eq(subscriptions.userId, ctx.user.id)); else localSet(`billing:${ctx.user.id}`, { ...current, ...values }); return values; }),
  }),
  admin: router({
    customers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      const db = await getDb();
      if (!db) return localGet("admin:customers", [{ id: ctx.user.id, name: ctx.user.name || "Owner", email: ctx.user.email || "", plan: "proPlus", status: "active", managedDomainAddOn: false, managedDomainName: null, managedDomainStatus: "none" }]);
      const rows = await db.select({ id: users.id, name: users.name, email: users.email, plan: subscriptions.plan, status: subscriptions.status, managedDomainAddOn: subscriptions.managedDomainAddOn, managedDomainName: subscriptions.managedDomainName, managedDomainStatus: subscriptions.managedDomainStatus }).from(users).leftJoin(subscriptions, eq(users.id, subscriptions.userId));
      return rows.map((row) => ({ ...row, plan: row.plan || "free", status: row.status || "inactive", managedDomainAddOn: row.managedDomainAddOn || false, managedDomainStatus: row.managedDomainStatus || "none" }));
    }),
    updateCustomer: protectedProcedure.input(z.object({ userId: z.number().int().positive(), plan: z.enum(["free", "pro", "proPlus"]), managedDomainAddOn: z.boolean(), managedDomainName: z.string().max(255).nullable().optional(), managedDomainStatus: z.enum(["none", "requested", "provisioning", "active", "failed"]).default("none") })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      const db = await getDb();
      const values = { plan: input.plan, status: input.plan === "free" ? "inactive" : "active", managedDomainAddOn: input.managedDomainAddOn, managedDomainName: input.managedDomainName ?? null, managedDomainStatus: input.managedDomainAddOn ? input.managedDomainStatus : "none" } as const;
      if (!db) { const customers = localGet<any[]>("admin:customers", []); localSet("admin:customers", customers.map((customer) => customer.id === input.userId ? { ...customer, ...values } : customer)); return { userId: input.userId, ...values }; }
      const existing = await db.select().from(subscriptions).where(eq(subscriptions.userId, input.userId)).limit(1);
      if (existing[0]) await db.update(subscriptions).set(values).where(eq(subscriptions.userId, input.userId)); else await db.insert(subscriptions).values({ userId: input.userId, ...values });
      return { userId: input.userId, ...values };
    }),
  }),
  domains: router({ list: protectedProcedure.query(async ({ ctx }) => { const db = await getDb(); if (!db) return localGet<any[]>(`domains:${ctx.user.id}`, []); const profile = await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1); return profile[0] ? db.select().from(customDomains).where(eq(customDomains.profileId, profile[0].id)) : []; }), add: protectedProcedure.input(z.object({ domain: customDomainSchema })).mutation(async ({ ctx, input }) => { const db = await getDb(); const subscription = db ? (await db.select().from(subscriptions).where(eq(subscriptions.userId, ctx.user.id)).limit(1))[0] : localGet<any>(`billing:${ctx.user.id}`, { plan: "free", status: "inactive" }); if (!subscription || subscription.plan === "free" || subscription.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "An active Pro or Pro+ plan is required to connect a custom domain" }); if (db) { const profile = await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1); if (profile[0]) await db.insert(customDomains).values({ profileId: profile[0].id, domain: input.domain, verificationToken: crypto.randomUUID() }); } else { const domains = localGet<any[]>(`domains:${ctx.user.id}`, []); localSet(`domains:${ctx.user.id}`, [...domains, { domain: input.domain, status: "pending" }]); } return { domain: input.domain, status: "pending" as const }; }) })
});
export type AppRouter = typeof appRouter;

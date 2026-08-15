import { eq, desc, gte, and } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { getDb } from "./db";
import { analyticsEvents, customDomains, profiles, repositories, subscriptions } from "../drizzle/schema";
import { getGitHubProfile, getGitHubRepos, integrationConfig, summarizeRepository } from "./integrations";
import { localGet, localSet } from "./localStore";

const demoProfile = { slug: "alexmorgan", displayName: "Alex Morgan", githubLogin: "alexmorgan", bio: "Product-minded engineer focused on interfaces, developer tools, and systems that help good ideas become useful things.", avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4", location: "London, UK", template: "atelier", isPublic: true, repositories: [{ name: "orbit-ui", description: "A small, intentional component system for expressive product interfaces.", language: "TypeScript", stars: 184, forks: 19, aiSummary: "A thoughtful UI foundation that balances accessible primitives with a strong visual point of view.", isPinned: true }, { name: "signal-cache", description: "Fast, typed caching for edge-first applications.", language: "Rust", stars: 92, forks: 8, aiSummary: "A compact caching layer designed for predictable performance and composable invalidation.", isPinned: true }] };

export const appRouter = router({
  system: systemRouter,
  auth: router({ me: publicProcedure.query(opts => opts.ctx.user), logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }) }),
  integrations: publicProcedure.query(() => integrationConfig),
  portfolio: router({
    bySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(80) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return localGet(`profile:${input.slug}`, input.slug === demoProfile.slug ? demoProfile : null);
      const result = await db.select().from(profiles).where(eq(profiles.slug, input.slug)).limit(1);
      if (!result[0] || !result[0].isPublic) return localGet(`profile:${input.slug}`, input.slug === demoProfile.slug ? demoProfile : null);
      const rows = await db.select().from(repositories).where(eq(repositories.profileId, result[0].id)).orderBy(desc(repositories.sortOrder));
      return { ...result[0], repositories: rows.filter(r => !r.isHidden) };
    }),
    saveSettings: protectedProcedure.input(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), template: z.string(), customCss: z.string().max(20000), isPublic: z.boolean() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) { localSet(`profile:${input.slug}`, { ...demoProfile, ...input, slug: input.slug }); return input; } const existing = await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1); if (existing[0]) await db.update(profiles).set(input).where(eq(profiles.userId, ctx.user.id)); else localSet(`profile:${input.slug}`, { ...demoProfile, ...input, slug: input.slug }); return input; }),
    updateRepository: protectedProcedure.input(z.object({ id: z.number(), displayName: z.string().optional(), displayDescription: z.string().optional(), isPinned: z.boolean().optional(), isHidden: z.boolean().optional(), sortOrder: z.number().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (db) await db.update(repositories).set(input).where(eq(repositories.id, input.id)); else localSet(`repo:${input.id}`, input); return { success: true }; }),
    syncGitHub: protectedProcedure.input(z.object({ accessToken: z.string().min(1) })).mutation(async ({ ctx, input }) => {
      const profile = await getGitHubProfile(input.accessToken);
      const repos = await getGitHubRepos(input.accessToken);
      const db = await getDb();
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
            await db.insert(repositories).values({ profileId, githubRepoId: String(repo.id), name: repo.name, description: repo.description, language: repo.language, stars: repo.stargazers_count, forks: repo.forks_count, url: repo.html_url, homepage: repo.homepage, aiSummary, sortOrder: index }).onDuplicateKeyUpdate({ set: { description: repo.description, language: repo.language, stars: repo.stargazers_count, forks: repo.forks_count, aiSummary } });
          }
        }
      } else {
        localSet(`profile:${profile.login.toLowerCase()}`, { ...demoProfile, slug: profile.login.toLowerCase(), githubLogin: profile.login, displayName: profile.name || profile.login, bio: profile.bio, avatarUrl: profile.avatar_url, location: profile.location, websiteUrl: profile.blog, repositories: repos.map((repo) => ({ name: repo.name, description: repo.description, language: repo.language, stars: repo.stargazers_count, forks: repo.forks_count, aiSummary: null, isPinned: false })) });
      }
      return { profile: { login: profile.login, name: profile.name }, repositories: repos.length };
    }),
  }),
  analytics: router({ record: publicProcedure.input(z.object({ slug: z.string(), referrer: z.string().optional(), country: z.string().optional(), region: z.string().optional(), visitorHash: z.string().optional(), utmSource: z.string().optional(), utmMedium: z.string().optional(), utmCampaign: z.string().optional(), consent: z.boolean().default(true) })).mutation(async ({ input }) => { if (!input.consent) return { ok: true, recorded: false }; const db = await getDb(); if (db) { const profile = await db.select().from(profiles).where(eq(profiles.slug, input.slug)).limit(1); if (profile[0] && profile[0].analyticsConsent) await db.insert(analyticsEvents).values({ profileId: profile[0].id, referrer: input.referrer, country: input.country, region: input.region, visitorHash: input.visitorHash, utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign }); } else { const events = localGet<any[]>(`analytics:${input.slug}`, []); localSet(`analytics:${input.slug}`, [...events, { ...input, createdAt: Date.now() }]); } return { ok: true, recorded: true }; }), summary: protectedProcedure.input(z.object({ days: z.number().min(1).max(365).default(30) }).optional()).query(async ({ ctx, input }) => { const days = input?.days ?? 30; const cutoff = Date.now() - days * 86400000; const db = await getDb(); if (!db) { const events = localGet<any[]>("analytics:alexmorgan", []).filter((event) => Number(event.createdAt) >= cutoff); const referrals = Object.entries(events.reduce<Record<string, number>>((acc, event) => { const key = [event.utmSource, event.utmMedium, event.utmCampaign].filter(Boolean).join(" / ") || event.referrer || "direct"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })); return { totalViews: events.length, uniqueVisitors: new Set(events.map((event) => event.visitorHash).filter(Boolean)).size, countries: Object.entries(events.reduce<Record<string, number>>((acc, event) => { const key = event.country || "Unknown"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })), regions: Object.entries(events.reduce<Record<string, number>>((acc, event) => { const key = event.region || "Unknown"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })), referrals, timeseries: events.map(() => 1), series: events.map((event) => ({ date: new Date(Number(event.createdAt)).toISOString().slice(0, 10), views: 1 })) }; } const profile = await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1); if (!profile[0]) return { totalViews: 0, uniqueVisitors: 0, countries: [], regions: [], referrals: [], timeseries: [] }; const events = await db.select().from(analyticsEvents).where(and(eq(analyticsEvents.profileId, profile[0].id), gte(analyticsEvents.createdAt, new Date(Date.now() - (input?.days ?? 30) * 86400000)))); const referrals = Object.entries(events.reduce<Record<string, number>>((acc, event) => { const key = [event.utmSource, event.utmMedium, event.utmCampaign].filter(Boolean).join(" / ") || event.referrer || "direct"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })); return { totalViews: events.length, uniqueVisitors: new Set(events.map(e => e.visitorHash).filter(Boolean)).size, countries: Object.entries(events.reduce<Record<string, number>>((acc, event) => { const key = event.country || "Unknown"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })), regions: Object.entries(events.reduce<Record<string, number>>((acc, event) => { const key = event.region || "Unknown"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })), referrals, timeseries: events.map(() => 1), series: events.map((event) => ({ date: new Date(event.createdAt).toISOString().slice(0, 10), views: 1 })) }; }) }),
  billing: router({ status: protectedProcedure.query(async ({ ctx }) => { const db = await getDb(); if (!db) return localGet(`billing:${ctx.user.id}`, { plan: "free", status: "inactive" }); const row = await db.select().from(subscriptions).where(eq(subscriptions.userId, ctx.user.id)).limit(1); return row[0] || { plan: "free", status: "inactive" }; }), createCheckout: protectedProcedure.mutation(async () => ({ checkoutUrl: process.env.PADDLE_CHECKOUT_URL || null, configured: Boolean(process.env.PADDLE_API_KEY && process.env.PADDLE_PRICE_ID) })) }),
  domains: router({ list: protectedProcedure.query(async ({ ctx }) => { const db = await getDb(); if (!db) return localGet<any[]>(`domains:${ctx.user.id}`, []); const profile = await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1); return profile[0] ? db.select().from(customDomains).where(eq(customDomains.profileId, profile[0].id)) : []; }), add: protectedProcedure.input(z.object({ domain: z.string().min(4).max(255) })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (db) { const profile = await db.select().from(profiles).where(eq(profiles.userId, ctx.user.id)).limit(1); if (profile[0]) await db.insert(customDomains).values({ profileId: profile[0].id, domain: input.domain, verificationToken: crypto.randomUUID() }); } else { const domains = localGet<any[]>(`domains:${ctx.user.id}`, []); localSet(`domains:${ctx.user.id}`, [...domains, { domain: input.domain, status: "pending" }]); } return { domain: input.domain, status: "pending" as const }; }) })
});
export type AppRouter = typeof appRouter;

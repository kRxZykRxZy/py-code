import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { applySecurityHeaders } from "./security";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb } from "../db";
import { customDomains, profiles, repositories } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { githubWebhookHandler, paddleWebhookHandler } from "../webhooks";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  app.use(applySecurityHeaders);
  app.post("/api/paddle/webhook", express.raw({ type: "application/json", limit: "1mb" }), paddleWebhookHandler);
  app.post("/api/github/webhook", express.raw({ type: "application/json", limit: "1mb" }), githubWebhookHandler);
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "2mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.get("/robots.txt", (_req, res) => {
    const origin = process.env.CANONICAL_ORIGIN || "";
    const disallow = process.env.ROBOTS_DISALLOW_ALL === "true" || process.env.PUBLIC_PORTFOLIOS_NOINDEX === "true";
    res.type("text/plain").send(`User-agent: *\n${disallow ? "Disallow: /" : "Allow: /"}\nSitemap: ${origin}/sitemap.xml\n`);
  });
  app.get("/sitemap.xml", async (_req, res, next) => {
    try {
      const origin = process.env.CANONICAL_ORIGIN || "";
      const db = await getDb();
      const publicProfiles = db ? await db.select({ id: profiles.id, slug: profiles.slug }).from(profiles).where(eq(profiles.isPublic, true)) : [];
      const visibleRepos = db ? await db.select({ profileId: repositories.profileId, name: repositories.name, isHidden: repositories.isHidden }).from(repositories) : [];
      const fallbackSlug = process.env.OWNER_NAME || "alexmorgan";
      const profileRows = publicProfiles.length ? publicProfiles : [{ id: -1, slug: fallbackSlug }];
      const urls = profileRows.flatMap((profile) => [
        `${origin}/${encodeURIComponent(profile.slug)}`,
        ...visibleRepos.filter((repo) => repo.profileId === profile.id && !repo.isHidden).map((repo) => `${origin}/${encodeURIComponent(profile.slug)}/projects/${encodeURIComponent(repo.name.toLowerCase())}`),
      ]);
      const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url}</loc></url>`).join("")}</urlset>`;
      res.type("application/xml").send(xml);
    } catch (error) {
      next(error);
    }
  });
  app.use(async (req, _res, next) => {
    if (!req.path.startsWith("/api") && !req.path.startsWith("/manus-storage") && !req.path.includes(".") && !["localhost", "127.0.0.1"].includes(req.hostname)) {
      const db = await getDb();
      if (db) {
        const match = await db.select({ slug: profiles.slug }).from(customDomains).innerJoin(profiles, eq(customDomains.profileId, profiles.id)).where(and(eq(customDomains.domain, req.hostname), eq(customDomains.status, "active"))).limit(1);
        if (match[0]?.slug) req.url = `/${encodeURIComponent(match[0].slug)}${req.path === "/" ? "" : req.path}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`;
      }
    }
    next();
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

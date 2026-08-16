import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] || character)); }
function injectRouteMetadata(page: string, requestUrl: string) {
  const pathname = requestUrl.split("?")[0];
  const parts = pathname.split("/").filter(Boolean);
  const slug = parts[0] || "alexmorgan";
  const project = parts[1] === "projects" && parts[2] ? decodeURIComponent(parts[2]) : "";
  const title = project ? `${project} — ${slug}` : `${slug} — GitHubFolio`;
  const description = project ? `Explore ${project}, a featured project from ${slug}'s GitHub portfolio.` : `Explore ${slug}'s selected GitHub work.`;
  const canonical = `${requestUrl.startsWith("http") ? requestUrl : ""}`;
  const head = `<meta name="description" content="${escapeHtml(description)}" /><meta property="og:title" content="${escapeHtml(title)}" /><meta property="og:description" content="${escapeHtml(description)}" /><meta property="og:type" content="${project ? "article" : "profile"}" /><meta property="og:url" content="${escapeHtml(canonical || pathname)}" /><meta name="twitter:card" content="summary" /><meta name="twitter:title" content="${escapeHtml(title)}" /><meta name="twitter:description" content="${escapeHtml(description)}" />`;
  return page.replace("    <title>GitHubFolio — Your work deserves a better frame.</title>", `<title>${escapeHtml(title)}</title>${head}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const transformedPage = await vite.transformIndexHtml(url, template);
      const page = injectRouteMetadata(transformedPage, url);
      res.status(200).set({ "Content-Type": "text/html", "Cache-Control": "no-cache" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", async (req, res, next) => {
    try {
      const template = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
      const page = injectRouteMetadata(template, req.originalUrl);
      res.status(200).set({ "Content-Type": "text/html", "Cache-Control": "no-cache" }).send(page);
    } catch (error) {
      next(error);
    }
  });
}

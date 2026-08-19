import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] || character)); }
function injectRouteMetadata(page: string, requestUrl: string, requestOrigin = process.env.CANONICAL_ORIGIN || "") {
  const pathname = requestUrl.split("?")[0];
  const query = requestUrl.includes("?") ? requestUrl.slice(requestUrl.indexOf("?") + 1) : "";
  const isPreview = new URLSearchParams(query).has("preview");
  const parts = pathname.split("/").filter(Boolean);
  const slug = parts[0] || "alexmorgan";
  const project = parts[1] === "projects" && parts[2] ? decodeURIComponent(parts[2]) : "";
  const title = project ? `${project} — ${slug}` : `${slug} — GitFolio`;
  const description = project ? `Explore ${project}, a featured project from ${slug}'s GitHub portfolio.` : `Explore ${slug}'s selected GitHub work.`;
  const locale = process.env.SITE_LOCALE || "en_US";
  const localeVariants = (process.env.SITE_LOCALES || locale).split(",").map((value) => value.trim()).filter(Boolean);
  const languageLinks = [...localeVariants.map((value) => `<link rel="alternate" hreflang="${escapeHtml(value.toLowerCase().replace("_", "-"))}" href="${escapeHtml(`${requestOrigin.replace(/\/$/, "")}${pathname}?lang=${encodeURIComponent(value)}`)}" />`), `<link rel="alternate" hreflang="x-default" href="${escapeHtml(`${requestOrigin.replace(/\/$/, "")}${pathname}`)}" />`].join("");
  const canonicalOrigin = requestOrigin.replace(/\/$/, "");
  const canonical = isPreview ? "" : `${canonicalOrigin}${pathname}`;
  const image = `https://quickchart.io/og?width=1200&height=630&title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`; const person = { "@context": "https://schema.org", "@type": "Person", name: slug, url: canonical || pathname, sameAs: [`https://github.com/${encodeURIComponent(slug)}`] }; const software = project ? { "@context": "https://schema.org", "@type": "SoftwareSourceCode", name: project, codeRepository: `https://github.com/${encodeURIComponent(slug)}/${encodeURIComponent(project)}`, url: canonical || pathname, description } : null; const jsonLd = JSON.stringify(software ? [person, software] : person).replace(/</g, "\\u003c"); const canonicalUrl = canonical || pathname; const languageCode = locale.split("_")[0].toLowerCase(); const head = `${isPreview ? `<meta name="robots" content="noindex,nofollow" />` : `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />${languageLinks}`}<meta name="description" content="${escapeHtml(description)}" /><meta property="og:title" content="${escapeHtml(title)}" /><meta property="og:description" content="${escapeHtml(description)}" /><meta property="og:type" content="${project ? "article" : "profile"}" /><meta property="og:url" content="${escapeHtml(canonical || pathname)}" /><meta property="og:locale" content="${escapeHtml(locale)}" /><meta property="og:image" content="${escapeHtml(image)}" /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${escapeHtml(title)}" /><meta name="twitter:description" content="${escapeHtml(description)}" /><meta name="twitter:image" content="${escapeHtml(image)}" /><script type="application/ld+json">${jsonLd}</script>`;
  return page.replace("    <title>GitFolio — Your work deserves a better frame.</title>", `<title>${escapeHtml(title)}</title>${head}`);
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
      const requestOrigin = process.env.CANONICAL_ORIGIN || `${req.protocol}://${req.get("host")}`;
      const page = injectRouteMetadata(transformedPage, url, requestOrigin);
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
      const requestOrigin = process.env.CANONICAL_ORIGIN || `${req.protocol}://${req.get("host")}`;
      const page = injectRouteMetadata(template, req.originalUrl, requestOrigin);
      res.status(200).set({ "Content-Type": "text/html", "Cache-Control": "no-cache" }).send(page);
    } catch (error) {
      next(error);
    }
  });
}

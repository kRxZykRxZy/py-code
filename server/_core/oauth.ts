import { COOKIE_NAME, GITHUB_OAUTH_VERIFIER_COOKIE, ONE_YEAR_MS, OAUTH_STATE_COOKIE } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { createHash, randomBytes } from "crypto";
import type { Express, Request, Response } from "express";
import axios from "axios";
import { eq } from "drizzle-orm";
import { githubConnections } from "../../drizzle/schema";
import * as db from "../db";
import { localSet } from "../localStore";
import { getSessionCookieOptions } from "./cookies";
import { createGitHubSessionToken } from "./githubSession";
import { recordSecurityAudit } from "../securityAudit";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export async function exchangeGitHubOAuthCode(input: { clientId: string; clientSecret: string; code: string; redirectUri: string; verifier: string }) {
  const response = await axios.post("https://github.com/login/oauth/access_token", { client_id: input.clientId, client_secret: input.clientSecret, code: input.code, redirect_uri: input.redirectUri, code_verifier: input.verifier }, { headers: { Accept: "application/json" }, timeout: 15_000 });
  return response.data as { access_token?: string; scope?: string; token_type?: string; error?: string };
}

const REQUIRED_GITHUB_SCOPES = ["read:user", "user:email"] as const;

export function hasRequiredGitHubScopes(scope: string | undefined) {
  const granted = new Set((scope || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean));
  return REQUIRED_GITHUB_SCOPES.every((required) => granted.has(required));
}

export function registerOAuthRoutes(app: Express) {
  const githubCredentials = () => ({ clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET });
  const callbackUrl = (req: Request) => {
    const forwardedProto = req.headers["x-forwarded-proto"];
    const protocol = typeof forwardedProto === "string" ? forwardedProto.split(",")[0] : req.protocol;
    return `${protocol}://${req.get("host")}/api/oauth/github/callback`;
  };
  const cookieOptions = (req: Request) => ({ ...getSessionCookieOptions(req), httpOnly: true, maxAge: 10 * 60 * 1000 });
  const clearOauthCookies = (req: Request, res: Response) => {
    const options = cookieOptions(req);
    res.clearCookie(OAUTH_STATE_COOKIE, options);
    res.clearCookie(GITHUB_OAUTH_VERIFIER_COOKIE, options);
  };

  app.get("/api/oauth/github/start", (req: Request, res: Response) => {
    const { clientId } = githubCredentials();
    if (!clientId) {
      res.status(503).json({ error: "GitHub sign-in is not configured" });
      return;
    }
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(64).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const options = cookieOptions(req);
    res.cookie(OAUTH_STATE_COOKIE, state, options);
    res.cookie(GITHUB_OAUTH_VERIFIER_COOKIE, verifier, options);
    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", callbackUrl(req));
    authorizeUrl.searchParams.set("scope", "read:user user:email");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("prompt", "select_account");
    recordSecurityAudit("oauth_started", "accepted");
    res.redirect(302, authorizeUrl.toString());
  });

  app.get("/api/oauth/github/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const oauthError = getQueryParam(req, "error");

    if (oauthError) {
      clearOauthCookies(req, res);
      recordSecurityAudit("oauth_denied", "rejected");
      res.redirect(302, `/?github_oauth_error=${encodeURIComponent(oauthError)}`);
      return;
    }

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const expectedState = cookies[OAUTH_STATE_COOKIE];
    const verifier = cookies[GITHUB_OAUTH_VERIFIER_COOKIE];
    if (!expectedState || state !== expectedState || !verifier) {
      recordSecurityAudit("oauth_state_rejected", "rejected");
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    clearOauthCookies(req, res);

    try {
      const { clientId, clientSecret } = githubCredentials();
      if (!clientId || !clientSecret) {
        res.status(503).json({ error: "GitHub sign-in is not configured" });
        return;
      }
      const tokenResponse = await exchangeGitHubOAuthCode({ clientId, clientSecret, code, redirectUri: callbackUrl(req), verifier });
      const accessToken = tokenResponse.access_token;
      if (!accessToken) {
        res.status(401).json({ error: "GitHub authorization was not accepted" });
        return;
      }
      if (!hasRequiredGitHubScopes(tokenResponse.scope)) {
        recordSecurityAudit("oauth_scope_downgraded", "rejected");
        res.redirect(302, "/?github_oauth_error=insufficient_scope");
        return;
      }
      const profileResponse = await axios.get("https://api.github.com/user", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" }, timeout: 15_000 });
      const profile = profileResponse.data as { id?: number; login?: string; name?: string | null; email?: string | null };
      if (!profile.id || !profile.login) {
        res.status(400).json({ error: "GitHub user profile is incomplete" });
        return;
      }
      const openId = `github:${profile.id}`;

      await db.upsertUser({
        openId,
        name: profile.name || profile.login,
        email: profile.email ?? null,
        loginMethod: "github",
        lastSignedIn: new Date(),
      });
      const database = await db.getDb();
      const user = await db.getUserByOpenId(openId);
      if (database && user) {
        await database.insert(githubConnections).values({ userId: user.id, githubId: String(profile.id), accessToken, scope: tokenResponse.scope ?? null }).onDuplicateKeyUpdate({ set: { githubId: String(profile.id), accessToken, scope: tokenResponse.scope ?? null, updatedAt: new Date() } });
      } else {
        localSet(`githubConnection:${openId}`, { githubId: String(profile.id), accessToken, scope: tokenResponse.scope ?? null, login: profile.login, updatedAt: Date.now() });
      }

      const sessionToken = await createGitHubSessionToken(openId, {
        name: profile.name || profile.login,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      recordSecurityAudit("oauth_succeeded", "accepted");
      res.redirect(302, "/");
    } catch (error) {
      console.error("[GitHub OAuth] Callback failed", error);
      recordSecurityAudit("oauth_failed", "failed");
      res.status(500).json({ error: "GitHub OAuth callback failed" });
    }
  });
}

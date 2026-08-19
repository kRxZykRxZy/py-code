import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { localGet, localSet } from "../localStore";

export type GitHubSessionPayload = {
  openId: string;
  name: string;
  issuedAt: number;
};

function sessionSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be configured for GitHub sessions");
  return new TextEncoder().encode(secret);
}

function fallbackGitHubUser(openId: string, name: string): User {
  const now = new Date();
  const numericId = Number(openId.slice("github:".length));
  return {
    id: Number.isFinite(numericId) ? -Math.abs(numericId) : -1,
    openId,
    name: name || "GitHub user",
    email: null,
    loginMethod: "github",
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

export async function createGitHubSessionToken(openId: string, options: { expiresInMs?: number; name?: string } = {}) {
  if (!openId.startsWith("github:")) throw new Error("GitHub session identity is required");
  const expiresAt = Math.floor((Date.now() + (options.expiresInMs ?? ONE_YEAR_MS)) / 1000);
  return new SignJWT({ openId, name: options.name || "GitHub user" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(sessionSecret());
}

export function revokeGitHubSessions(openId: string) {
  if (!openId.startsWith("github:")) throw new Error("GitHub session identity is required");
  localSet(`session-revoked-after:${openId}`, Math.floor(Date.now() / 1000));
}

export async function verifyGitHubSessionToken(value: string | undefined | null): Promise<GitHubSessionPayload | null> {
  if (!value) return null;
  try {
    const { payload } = await jwtVerify(value, sessionSecret(), { algorithms: ["HS256"] });
    const openId = payload.openId;
    const name = payload.name;
    const issuedAt = typeof payload.iat === "number" ? payload.iat : 0;
    const revokedAfter = typeof openId === "string" ? localGet<number>(`session-revoked-after:${openId}`, 0) : 0;
    return typeof openId === "string" && openId.startsWith("github:") && typeof name === "string" && issuedAt > revokedAfter ? { openId, name, issuedAt } : null;
  } catch {
    return null;
  }
}

export async function authenticateGitHubRequest(req: Request): Promise<User> {
  const cookies = parseCookieHeader(req.headers.cookie || "");
  const session = await verifyGitHubSessionToken(cookies[COOKIE_NAME]);
  if (!session) throw new Error("Invalid GitHub session");

  const signedInAt = new Date();
  let user = await db.getUserByOpenId(session.openId);
  if (!user) {
    try {
      await db.upsertUser({ openId: session.openId, name: session.name, email: null, loginMethod: "github", lastSignedIn: signedInAt });
      user = await db.getUserByOpenId(session.openId);
    } catch (error) {
      console.warn("[GitHub auth] Session is running without database persistence", String(error));
    }
  }
  if (!user) return fallbackGitHubUser(session.openId, session.name);
  await db.upsertUser({ openId: user.openId, lastSignedIn: signedInAt });
  return user;
}

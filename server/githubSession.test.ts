import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { COOKIE_NAME } from "../shared/const";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) process.env.JWT_SECRET = "test-github-session-secret-that-is-long-enough";

const mocks = vi.hoisted(() => ({ getUserByOpenId: vi.fn().mockResolvedValue(undefined), upsertUser: vi.fn().mockResolvedValue(undefined) }));

vi.mock("./db", () => ({ getUserByOpenId: mocks.getUserByOpenId, upsertUser: mocks.upsertUser }));

import { authenticateGitHubRequest, createGitHubSessionToken } from "./_core/githubSession";

describe("GitHub session fallback", () => {
  it("refuses to mint sessions for non-GitHub identities", async () => {
    await expect(createGitHubSessionToken("external:12345", { name: "Other identity" })).rejects.toThrow("GitHub session identity is required");
  });

  it("resolves a verified GitHub session without an external identity fallback when no database user exists", async () => {
    const token = await createGitHubSessionToken("github:12345", { name: "Octo Developer" });
    const user = await authenticateGitHubRequest({ headers: { cookie: `${COOKIE_NAME}=${token}` } } as Request);

    expect(user).toMatchObject({ openId: "github:12345", name: "Octo Developer", loginMethod: "github", role: "user" });
    expect(user.id).toBe(-12345);
    expect(mocks.getUserByOpenId).toHaveBeenCalledWith("github:12345");
    expect(mocks.upsertUser).toHaveBeenCalledWith(expect.objectContaining({ openId: "github:12345", loginMethod: "github" }));
  });
});

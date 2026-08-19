import { describe, expect, it } from "vitest";
import { createGitHubSessionToken, revokeGitHubSessions, verifyGitHubSessionToken } from "./_core/githubSession";

describe("GitHub session revocation", () => {
  it("rejects a session token issued before the account's revocation timestamp", async () => {
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "a".repeat(32);
    try {
      const openId = "github:99887766";
      const token = await createGitHubSessionToken(openId, { name: "GitHub user" });
      revokeGitHubSessions(openId);
      expect(await verifyGitHubSessionToken(token)).toBeNull();
    } finally {
      process.env.JWT_SECRET = original;
    }
  });
});

import axios from "axios";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { exchangeGitHubOAuthCode } from "./_core/oauth";

describe("GitHub OAuth credentials", () => {
  it("uses the GitHub OAuth start route as the only client login entry point", async () => {
    const loginHelper = await readFile(join(process.cwd(), "client/src/const.ts"), "utf8");
    expect(loginHelper).toContain('window.location.assign("/api/oauth/github/start")');
    expect(loginHelper.toLowerCase()).not.toContain("manus");
  });

  it("registers the login route with GitHub's authorization endpoint only", async () => {
    const oauthSource = await readFile(join(process.cwd(), "server/_core/oauth.ts"), "utf8");
    expect(oauthSource).toContain('app.get("/api/oauth/github/start"');
    expect(oauthSource).toContain('new URL("https://github.com/login/oauth/authorize")');
    expect(oauthSource.toLowerCase()).not.toContain("manus");
  });

  it("sends configured credentials only to GitHub’s documented token-exchange endpoint", async () => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    expect(clientId).toBeTruthy();
    expect(clientSecret).toBeTruthy();

    const post = vi.spyOn(axios, "post").mockResolvedValueOnce({ data: { access_token: "token", scope: "read:user,user:email", token_type: "bearer" } });
    await expect(exchangeGitHubOAuthCode({ clientId: clientId!, clientSecret: clientSecret!, code: "one-time-code", redirectUri: "https://example.test/api/oauth/github/callback", verifier: "pkce-verifier" })).resolves.toMatchObject({ access_token: "token" });
    expect(post).toHaveBeenCalledWith("https://github.com/login/oauth/access_token", expect.objectContaining({ client_id: clientId, client_secret: clientSecret, code: "one-time-code", code_verifier: "pkce-verifier" }), expect.objectContaining({ headers: { Accept: "application/json" } }));
    post.mockRestore();
  }, 20_000);
});

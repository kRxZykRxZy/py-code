import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("security audit events", () => {
  it("records bounded GitHub OAuth outcomes without logging secrets or user identity", async () => {
    const audit = await readFile(join(process.cwd(), "server/securityAudit.ts"), "utf8");
    const oauth = await readFile(join(process.cwd(), "server/_core/oauth.ts"), "utf8");
    expect(audit).toContain('event: "security_audit"');
    expect(audit).not.toContain("accessToken");
    expect(audit).not.toContain("openId");
    expect(oauth).toContain('recordSecurityAudit("oauth_succeeded", "accepted")');
    expect(oauth).toContain('recordSecurityAudit("oauth_state_rejected", "rejected")');
  });
});

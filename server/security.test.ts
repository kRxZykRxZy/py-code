import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { applySecurityHeaders } from "./_core/security";
import { resetRateLimitsForTests } from "./_core/trpc";

function publicContext(ip = "203.0.113.75"): TrpcContext {
  return { user: undefined, req: { protocol: "https", ip, headers: { "x-forwarded-for": ip } } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("security safeguards", () => {
  it("sets baseline anti-sniffing, framing, referrer, permission, and opener headers", () => {
    const headers = new Map<string, string>();
    let advanced = false;
    applySecurityHeaders({} as Request, { setHeader: (name: string, value: string) => { headers.set(name, value); } } as unknown as Response, () => { advanced = true; });
    expect(advanced).toBe(true);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });

  it("rate limits repeated public API calls by requester identity", async () => {
    resetRateLimitsForTests();
    const caller = appRouter.createCaller(publicContext("203.0.113.99"));
    for (let request = 0; request < 120; request++) await expect(caller.integrations()).resolves.toBeTruthy();
    await expect(caller.integrations()).rejects.toThrow("Too many requests");
  });

  it("rejects unsafe custom-domain input before entitlement or persistence checks", async () => {
    const now = new Date();
    const ctx: TrpcContext = { user: { id: 1122, openId: "security-test", name: "Security Tester", email: null, loginMethod: "test", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now }, req: { protocol: "https", ip: "203.0.113.100", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    await expect(appRouter.createCaller(ctx).domains.add({ domain: "https://invalid.example.com/path" })).rejects.toBeTruthy();
  });
});

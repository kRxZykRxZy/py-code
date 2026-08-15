import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function publicContext(): TrpcContext {
  return {
    user: undefined,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("core portfolio procedures", () => {
  it("returns the demo public profile by slug", async () => {
    const caller = appRouter.createCaller(publicContext());
    const profile = await caller.portfolio.bySlug({ slug: "alexmorgan" });
    expect(profile?.slug).toBe("alexmorgan");
    expect(profile?.repositories.length).toBeGreaterThan(0);
  });

  it("exposes integration readiness without leaking credentials", async () => {
    const caller = appRouter.createCaller(publicContext());
    const readiness = await caller.integrations();
    expect(readiness).toHaveProperty("paddleConfigured");
    expect(readiness).toHaveProperty("storageMode");
    expect(JSON.stringify(readiness)).not.toContain("SECRET");
  });

  it("records an analytics event successfully for an unknown public slug", async () => {
    const caller = appRouter.createCaller(publicContext());
    await expect(caller.analytics.record({ slug: "unknown-profile", referrer: "github.com" })).resolves.toEqual({ ok: true });
  });

  it("rejects invalid public profile slugs", async () => {
    const caller = appRouter.createCaller(publicContext());
    await expect(caller.portfolio.bySlug({ slug: "" })).rejects.toBeTruthy();
  });
});

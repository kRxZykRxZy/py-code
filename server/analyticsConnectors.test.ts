import { describe, expect, it, vi } from "vitest";
vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(): TrpcContext {
  const now = new Date();
  return { user: { id: 9_001, openId: "github:analytics-connectors", name: "Analytics Tester", email: null, loginMethod: "github", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"] };
}

describe("analytics connector preferences", () => {
  it("stores only validated public Google and Plausible identifiers", async () => {
    const caller = appRouter.createCaller(context()).analyticsConnector;
    await expect(caller.save({ provider: "google", measurementId: "G-ABC12345" })).resolves.toMatchObject({ provider: "google" });
    await expect(caller.save({ provider: "plausible", domain: "portfolio.example.dev" })).resolves.toMatchObject({ provider: "plausible" });
    await expect(caller.list()).resolves.toHaveLength(2);
    await expect(caller.save({ provider: "google", measurementId: "not-a-measurement-id" })).rejects.toBeTruthy();
    await expect(caller.remove({ provider: "google" })).resolves.toEqual({ removed: true });
    await expect(caller.list()).resolves.toEqual([{ provider: "plausible", domain: "portfolio.example.dev" }]);
  });
});

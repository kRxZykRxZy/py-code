import { describe, expect, it, vi } from "vitest";
vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));
import { appRouter } from "./routers";
import { localGet, localSet } from "./localStore";
import type { TrpcContext } from "./_core/context";

function context(): TrpcContext {
  const now = new Date();
  return { user: { id: 8_001, openId: "github:recovery-test", name: "Recovery Tester", email: "recovery@example.test", loginMethod: "github", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"] };
}

describe("account recovery safeguards", () => {
  it("requires the exact destructive confirmation and clears the active session on deletion", async () => {
    const ctx = context();
    localSet("githubConnection:github:recovery-test", { login: "recovery-test" });
    localSet("profile:recovery-test", { slug: "recovery-test", repositories: [] });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.account.deleteAccount({ confirmation: "DELETE" as never })).rejects.toBeTruthy();
    await expect(caller.account.deleteAccount({ confirmation: "DELETE MY ACCOUNT" })).resolves.toEqual({ deleted: true });
    expect(localGet("profile:recovery-test", null)).toBeNull();
    expect((ctx.res.clearCookie as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });
});

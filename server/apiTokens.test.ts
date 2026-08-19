import { describe, expect, it, vi } from "vitest";
vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(): TrpcContext { const now = new Date(); return { user: { id: 10_001, openId: "github:token-test", name: "Token Tester", email: null, loginMethod: "github", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"] }; }

describe("portfolio API tokens", () => {
  it("returns a raw token once while retaining only safe list metadata and supports revocation", async () => {
    const api = appRouter.createCaller(context()).apiTokens;
    const created = await api.create({ label: "Deployment" });
    expect(created.token).toMatch(/^gft_/);
    expect((await api.list())[0]).toMatchObject({ id: created.record.id, label: "Deployment", tokenPrefix: created.token.slice(0, 12) });
    expect(JSON.stringify(await api.list())).not.toContain(created.token);
    await expect(api.revoke({ id: created.record.id })).resolves.toEqual({ revoked: true });
    expect((await api.list())[0].revokedAt).toBeTruthy();
  });
});

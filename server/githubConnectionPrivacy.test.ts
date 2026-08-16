import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { localSet } from "./localStore";

vi.mock("./db", () => ({ getDb: vi.fn().mockResolvedValue(null) }));

import { appRouter } from "./routers";

function githubContext(): TrpcContext {
  const now = new Date();
  return { user: { id: -42, openId: "github:42", email: null, name: "Octo Dev", loginMethod: "github", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("GitHub connection privacy", () => {
  it("shows safe metadata and removes the locally stored authorization on disconnect", async () => {
    localSet("githubConnection:github:42", { githubId: "42", login: "octo-dev", accessToken: "never-expose-this", scope: "read:user,user:email" });
    const caller = appRouter.createCaller(githubContext());
    const status = await caller.github.connection();
    expect(status).toMatchObject({ connected: true, login: "octo-dev", scopes: ["read:user", "user:email"] });
    expect(JSON.stringify(status)).not.toContain("never-expose-this");
    await expect(caller.github.disconnect()).resolves.toEqual({ disconnected: true });
    await expect(caller.github.connection()).resolves.toMatchObject({ connected: false });
  });
});

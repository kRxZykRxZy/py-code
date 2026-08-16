import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { COOKIE_NAME } from "../shared/const";

const mocks = vi.hoisted(() => ({ getUserByOpenId: vi.fn().mockResolvedValue(undefined), upsertUser: vi.fn().mockResolvedValue(undefined) }));

vi.mock("./db", () => ({ getUserByOpenId: mocks.getUserByOpenId, upsertUser: mocks.upsertUser }));

import { sdk } from "./_core/sdk";

describe("GitHub session fallback", () => {
  it("resolves a verified GitHub session without contacting Manus when no database user exists", async () => {
    const token = await sdk.signSession({ openId: "github:12345", appId: "githubfolio", name: "Octo Developer" });
    const user = await sdk.authenticateRequest({ headers: { cookie: `${COOKIE_NAME}=${token}` } } as Request);

    expect(user).toMatchObject({ openId: "github:12345", name: "Octo Developer", loginMethod: "github", role: "user" });
    expect(user.id).toBe(-12345);
    expect(mocks.getUserByOpenId).toHaveBeenCalledWith("github:12345");
    expect(mocks.upsertUser).toHaveBeenCalledWith(expect.objectContaining({ openId: "github:12345", loginMethod: "github" }));
  });
});

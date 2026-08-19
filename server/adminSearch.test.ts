import { describe, expect, it, vi } from "vitest";
vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));
import { appRouter } from "./routers";
import { localSet } from "./localStore";
import type { TrpcContext } from "./_core/context";

function context(role: "admin" | "user"): TrpcContext {
  const now = new Date();
  return { user: { id: role === "admin" ? 7_001 : 7_002, openId: `github:${role}`, name: role, email: `${role}@example.test`, loginMethod: "github", role, createdAt: now, updatedAt: now, lastSignedIn: now }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("owner-admin customer search", () => {
  it("returns only matching customer records to an administrator", async () => {
    localSet("admin:customers", [{ id: 1, name: "Ada Lovelace", email: "ada@example.test", plan: "pro", status: "active", managedDomainAddOn: false, managedDomainName: null, managedDomainStatus: "none" }, { id: 2, name: "Grace Hopper", email: "grace@example.test", plan: "free", status: "inactive", managedDomainAddOn: false, managedDomainName: null, managedDomainStatus: "none" }]);
    const caller = appRouter.createCaller(context("admin"));
    await expect(caller.admin.searchCustomers({ query: "ada" })).resolves.toMatchObject([{ id: 1, email: "ada@example.test" }]);
  });

  it("does not expose customer search to ordinary users", async () => {
    await expect(appRouter.createCaller(context("user")).admin.searchCustomers({ query: "ada" })).rejects.toThrow("Admin access required");
  });

  it("exports bounded CSV records only to an administrator", async () => {
    localSet("admin:customers", [{ id: 3, name: "Ada \"Countess\"", email: "ada@example.test", plan: "pro", status: "active", managedDomainAddOn: false, managedDomainName: null, managedDomainStatus: "none" }]);
    await expect(appRouter.createCaller(context("admin")).admin.exportCustomers()).resolves.toMatchObject({ filename: expect.stringMatching(/^gitfolio-customers-/), csv: expect.stringContaining('"Ada ""Countess"""') });
    await expect(appRouter.createCaller(context("user")).admin.exportCustomers()).rejects.toThrow("Admin access required");
  });
});

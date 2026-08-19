import { describe, expect, it } from "vitest";

describe("Supabase server credentials", () => {
  it("authenticates to the Supabase health endpoint with the service-role key", async () => {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const databaseUrl = process.env.SUPABASE_DATABASE_URL;
    expect(url).toMatch(/^https:\/\//);
    expect(serviceRoleKey).toBeTruthy();
    expect(databaseUrl).toMatch(/^postgres(?:ql)?:\/\//);

    const response = await fetch(`${url!.replace(/\/$/, "")}/auth/v1/health`, {
      headers: { apikey: serviceRoleKey!, Authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(response.ok).toBe(true);

    const storageResponse = await fetch(`${url!.replace(/\/$/, "")}/storage/v1/bucket`, {
      headers: { apikey: serviceRoleKey!, Authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(storageResponse.ok).toBe(true);
  }, 15_000);
});

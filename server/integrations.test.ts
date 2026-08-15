import { describe, expect, it } from "vitest";
import { integrationConfig } from "./integrations";

describe("integration fallbacks", () => {
  it("uses the free Pollinations endpoint when no API key is present", () => {
    if (!process.env.POLLINATIONS_API_URL && !process.env.POLLINATIONS_API_KEY) {
      expect(integrationConfig.pollinationsEndpoint).toBe("https://text.pollinations.ai");
    }
  });

  it("does not advertise paid tiers without Paddle configuration", () => {
    if (!process.env.PADDLE_API_KEY || !process.env.PADDLE_PRICE_ID) {
      expect(integrationConfig.paidTiers).toEqual([]);
      expect(integrationConfig.paddleConfigured).toBe(false);
    }
  });

  it("selects local storage when Supabase is unavailable", () => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      expect(integrationConfig.storageMode).toBe("local-sqlite");
    }
  });
});

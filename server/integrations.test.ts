import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

import axios from "axios";
import { generatePortfolioNarrative, integrationConfig } from "./integrations";

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

  it("parses an AI portfolio headline and skill clusters", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: '{"headline":"Designing reliable developer experiences.","skills":["TypeScript","Developer tools"]}' });
    await expect(generatePortfolioNarrative({ bio: "Builder", repositories: [{ name: "orbit-ui", language: "TypeScript" }] })).resolves.toEqual({ headline: "Designing reliable developer experiences.", skills: ["TypeScript", "Developer tools"] });
  });

  it("falls back to repository signals when narrative generation fails", async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error("offline"));
    const narrative = await generatePortfolioNarrative({ bio: "Builder", repositories: [{ name: "orbit-ui", language: "TypeScript" }, { name: "cache", language: "Rust" }] });
    expect(narrative.headline).toMatch(/TypeScript and Rust/);
    expect(narrative.skills).toEqual(["TypeScript", "Rust"]);
  });
});

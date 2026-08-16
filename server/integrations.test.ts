import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

import axios from "axios";
import { generatePortfolioNarrative, getGitHubContributorCount, integrationConfig, summarizeCommitActivity, summarizeRepository } from "./integrations";

describe("integration fallbacks", () => {
  beforeEach(() => vi.mocked(axios.get).mockReset());
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

  it("counts contributors across pagination and summarizes commit activity", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: Array.from({ length: 100 }, () => ({})) }).mockResolvedValueOnce({ data: Array.from({ length: 5 }, () => ({})) });
    await expect(getGitHubContributorCount("token", { id: 1, name: "folio", description: null, language: "TypeScript", stargazers_count: 0, forks_count: 0, html_url: "https://github.com/org/folio", homepage: null, owner: { login: "org", type: "Organization" } })).resolves.toBe(105);
    expect(summarizeCommitActivity([1, 0, 3, 2])).toBe("6 commits across 3/4 recent weeks; peak week 3");
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

  it("includes selected tone and length guidance in a repository summary prompt", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: "A detailed technical summary." });
    await expect(summarizeRepository({ name: "orbit-ui", language: "TypeScript" }, { tone: "technical", length: "detailed" })).resolves.toBe("A detailed technical summary.");
    const url = String(vi.mocked(axios.get).mock.calls[0]?.[0] || "");
    expect(decodeURIComponent(url)).toContain("three sentences");
    expect(decodeURIComponent(url)).toContain("technical voice");
  });
});

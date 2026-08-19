import { describe, expect, it } from "vitest";

describe("managed application title", () => {
  it("uses the GitFolio title in the runtime configuration", () => {
    expect(process.env.VITE_APP_TITLE).toBe("GitFolio");
  });
});

import { describe, expect, it } from "vitest";
import { scopePortfolioCss, validatePortfolioCss } from "@shared/customCss";

describe("portfolio custom CSS safeguards", () => {
  it("scopes each authored selector to the portfolio preview", () => {
    expect(scopePortfolioCss(".project, .hero:hover { color: red; }")).toBe(".portfolio-preview-shell .project, .portfolio-preview-shell .hero:hover { color: red;}");
  });

  it("rejects unsafe or global CSS patterns", () => {
    expect(validatePortfolioCss("@import url('https://example.com/a.css');")).toMatch(/At-rules/);
    expect(validatePortfolioCss("body { color: red; }")).toMatch(/Global/);
    expect(validatePortfolioCss(".card { background: url(https://example.com/a.png); }")).toMatch(/External URLs/);
    expect(validatePortfolioCss(".toast { position: fixed; }")).toMatch(/Fixed/);
  });

  it("permits ordinary portfolio component styling", () => {
    expect(validatePortfolioCss(".project-card { border-radius: 20px; color: #123a32; }")).toBeNull();
  });
});

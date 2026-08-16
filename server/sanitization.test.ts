import { describe, expect, it } from "vitest";
import { sanitizePlainText } from "./sanitization";
import { renderMarkdown, sanitizeMarkdownSource } from "../shared/markdown";

describe("plain text sanitization", () => {
  it("normalizes whitespace and strips control and markup delimiters", () => {
    expect(sanitizePlainText("  Build\u0000 <strong> calm </strong>\nsoftware  ", 80)).toBe("Build strong calm /strong software");
  });

  it("uses a stable maximum after normalization", () => {
    expect(sanitizePlainText("abcdef", 4)).toBe("abcd");
  });

  it("removes raw HTML and unsafe Markdown protocols", () => {
    const source = sanitizeMarkdownSource("# Hello <script>alert(1)</script> [bad](javascript:alert(1)) [good](https://example.com)");
    expect(source).not.toContain("<script>");
    expect(source).not.toContain("javascript:");
    expect(renderMarkdown(source)).toContain("https://example.com");
    expect(renderMarkdown(source)).not.toContain("<script");
  });

  it("bounds Markdown source length", () => {
    expect(sanitizeMarkdownSource("x".repeat(20), 8)).toHaveLength(8);
  });
});

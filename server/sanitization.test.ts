import { describe, expect, it } from "vitest";
import { sanitizePlainText } from "./sanitization";

describe("plain text sanitization", () => {
  it("normalizes whitespace and strips control and markup delimiters", () => {
    expect(sanitizePlainText("  Build\u0000 <strong> calm </strong>\nsoftware  ", 80)).toBe("Build strong calm /strong software");
  });

  it("uses a stable maximum after normalization", () => {
    expect(sanitizePlainText("abcdef", 4)).toBe("abcd");
  });
});

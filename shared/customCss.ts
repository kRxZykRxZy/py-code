const UNSAFE_CSS = [
  { pattern: /@(?:import|font-face|keyframes|media|supports|layer|container)\b/i, message: "At-rules are not allowed in custom CSS" },
  { pattern: /url\s*\(/i, message: "External URLs are not allowed in custom CSS" },
  { pattern: /expression\s*\(|javascript\s*:/i, message: "Executable CSS expressions are not allowed" },
  { pattern: /(?:behavior\s*:|-moz-binding\s*:)/i, message: "Legacy executable CSS properties are not allowed" },
  { pattern: /<\/?style|<\/?script/i, message: "HTML markup is not allowed in custom CSS" },
  { pattern: /(?:^|[,\s])(?:html|body|:root)(?:\s|,|{|>|\.|#|:)/i, message: "Global page selectors are not allowed" },
  { pattern: /position\s*:\s*(?:fixed|sticky)/i, message: "Fixed or sticky positioning is not allowed in custom CSS" },
];

export function validatePortfolioCss(css: string): string | null {
  if (!css.trim()) return null;
  if (css.length > 20_000) return "Custom CSS must be 20,000 characters or fewer";
  if (css.includes("/*") !== css.includes("*/")) return "Custom CSS contains an unclosed comment";
  for (const rule of UNSAFE_CSS) if (rule.pattern.test(css)) return rule.message;
  return null;
}

export function scopePortfolioCss(css: string): string {
  if (!css.trim()) return "";
  return css.split("}").map((rawRule) => {
    const rule = rawRule.trim();
    if (!rule) return "";
    const boundary = rule.indexOf("{");
    if (boundary < 1) return "";
    const selectors = rule.slice(0, boundary).split(",").map((selector) => `.portfolio-preview-shell ${selector.trim()}`).join(", ");
    return `${selectors} {${rule.slice(boundary + 1)}}`;
  }).filter(Boolean).join("\n");
}

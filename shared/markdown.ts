import { marked } from "marked";

const MAX_MARKDOWN_LENGTH = 12_000;

export function sanitizeMarkdownSource(value: string, maxLength = MAX_MARKDOWN_LENGTH) {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/<\/?(?:script|style|iframe|object|embed|form|svg)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\]\(\s*(?:javascript|data|vbscript):[^)]*\)/gi, "]")
    .slice(0, maxLength);
}

export function renderMarkdown(value: string) {
  const source = sanitizeMarkdownSource(value);
  return marked.parse(source, { async: false, gfm: true, breaks: true }) as string;
}

export const markdownLimits = { maxLength: MAX_MARKDOWN_LENGTH } as const;

/** Normalize plain user-authored copy before it is stored or rendered. */
export function sanitizePlainText(value: string, maxLength: number) {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeHttpUrl(value: string) {
  const candidate = value.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Image assets are always served from the configured external storage provider. */
export function sanitizeImageUrl(value: string) {
  const url = sanitizeHttpUrl(value);
  return url?.startsWith("https://") ? url : null;
}

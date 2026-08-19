function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

export async function encryptAccountExport(payload: unknown, passphrase: string) {
  if (passphrase.length < 12) throw new Error("Use an export passphrase of at least 12 characters.");
  if (!globalThis.crypto?.subtle) throw new Error("Secure export encryption is unavailable in this browser.");
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 310_000 }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(payload))));
  return { version: 1, algorithm: "AES-256-GCM", kdf: "PBKDF2-SHA-256", iterations: 310_000, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

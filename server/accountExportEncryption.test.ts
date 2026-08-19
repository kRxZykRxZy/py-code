import { describe, expect, it } from "vitest";
import { encryptAccountExport } from "../shared/accountExportEncryption";

describe("encrypted account exports", () => {
  it("wraps account content in a versioned AES-GCM envelope without plaintext", async () => {
    const encrypted = await encryptAccountExport({ email: "owner@example.test", repositories: ["private-repo"] }, "a long export passphrase");
    expect(encrypted).toMatchObject({ version: 1, algorithm: "AES-256-GCM", kdf: "PBKDF2-SHA-256", iterations: 310_000 });
    expect(JSON.stringify(encrypted)).not.toContain("owner@example.test");
  });

  it("requires a sufficiently strong export passphrase", async () => {
    await expect(encryptAccountExport({ ok: true }, "short")).rejects.toThrow("at least 12 characters");
  });
});

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

describe("Paddle webhook signing secret", () => {
  it("is available server-side and produces an HMAC-SHA256 signature", () => {
    const secret = process.env.PADDLE_WEBHOOK_SECRET;
    expect(secret).toBeTruthy();
    expect(secret?.trim().length).toBeGreaterThan(15);

    const signature = createHmac("sha256", secret!).update("ts:1700000000;{}", "utf8").digest("hex");
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });
});

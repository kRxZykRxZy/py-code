import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { paddleLifecycleStatus, verifyGitHubSignature, verifyPaddleSignature } from "./webhooks";

const paddleSecret = "paddle-test-secret-with-sufficient-entropy";
const githubSecret = "github-test-secret-with-sufficient-entropy";
const body = '{"event_id":"evt_123","event_type":"subscription.created"}';
const now = 1_725_000_000_000;

function paddleHeader(rawBody = body, timestamp = Math.floor(now / 1000)) {
  const digest = createHmac("sha256", paddleSecret).update(`${timestamp}:${rawBody}`, "utf8").digest("hex");
  return `ts=${timestamp};h1=${digest}`;
}

describe("Paddle webhook verification", () => {
  it("accepts a valid timestamped HMAC signature", () => {
    expect(verifyPaddleSignature(body, paddleHeader(), paddleSecret, now)).toBe(true);
  });

  it("rejects a tampered body, an expired delivery, and a missing secret", () => {
    expect(verifyPaddleSignature(`${body}x`, paddleHeader(), paddleSecret, now)).toBe(false);
    expect(verifyPaddleSignature(body, paddleHeader(body, Math.floor(now / 1000) - 301), paddleSecret, now)).toBe(false);
    expect(verifyPaddleSignature(body, paddleHeader(), undefined, now)).toBe(false);
  });

  it("maps the supported subscription lifecycle states", () => {
    expect(paddleLifecycleStatus("subscription.created", {})).toBe("active");
    expect(paddleLifecycleStatus("subscription.canceled", {})).toBe("canceled");
    expect(paddleLifecycleStatus("subscription.past_due", {})).toBe("past_due");
    expect(paddleLifecycleStatus("subscription.paused", {})).toBe("paused");
    expect(paddleLifecycleStatus("subscription.updated", { status: "trialing" })).toBe("trialing");
  });
});

describe("GitHub webhook verification", () => {
  it("accepts a valid sha256 signature", () => {
    const signature = `sha256=${createHmac("sha256", githubSecret).update(body, "utf8").digest("hex")}`;
    expect(verifyGitHubSignature(body, signature, githubSecret)).toBe(true);
  });

  it("rejects a mismatched signature or unavailable secret", () => {
    expect(verifyGitHubSignature(body, "sha256=not-a-valid-signature", githubSecret)).toBe(false);
    expect(verifyGitHubSignature(body, "sha256=not-a-valid-signature", undefined)).toBe(false);
  });
});

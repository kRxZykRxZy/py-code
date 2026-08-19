import { describe, expect, it } from "vitest";
import { getPlanChangePreview } from "./billingPlanPolicy";

describe("billing plan-change policy", () => {
  it("discloses immediate, confirmed upgrades and Paddle proration", () => {
    expect(getPlanChangePreview("pro", "proPlus", null)).toMatchObject({ direction: "upgrade", effectiveAt: "immediately", requiresConfirmation: true });
    expect(getPlanChangePreview("pro", "proPlus", null).message).toContain("prorated");
  });

  it("safeguards downgrades until the end of the term", () => {
    const renewsAt = new Date("2026-09-01T00:00:00.000Z");
    expect(getPlanChangePreview("proPlus", "pro", renewsAt)).toMatchObject({ direction: "downgrade", effectiveAt: "end_of_term", requiresConfirmation: true, preserveAccessUntil: renewsAt });
  });
});

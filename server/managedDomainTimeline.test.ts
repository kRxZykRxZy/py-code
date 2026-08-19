import { describe, expect, it } from "vitest";
import { buildManagedDomainTimeline } from "./managedDomainTimeline";

describe("managed-domain timeline", () => {
  it("shows a chronological request and provisioning path for an active domain", () => {
    const timeline = buildManagedDomainTimeline({ managedDomainAddOn: true, managedDomainName: "example.dev", managedDomainStatus: "active", createdAt: new Date("2026-08-01T00:00:00Z"), updatedAt: new Date("2026-08-10T00:00:00Z") });
    expect(timeline.map((item) => item.id)).toEqual(["service", "request", "provisioning", "active"]);
    expect(timeline.at(-1)).toMatchObject({ current: true, complete: true, label: "Live and monitored" });
  });

  it("does not claim a timeline before the managed-domain service is active", () => {
    expect(buildManagedDomainTimeline({ managedDomainAddOn: false })).toEqual([]);
  });
});

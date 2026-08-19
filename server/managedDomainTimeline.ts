export type ManagedDomainStatus = "none" | "requested" | "provisioning" | "active" | "failed";

export type ManagedDomainTimelineItem = {
  id: "service" | "request" | "provisioning" | "active" | "failed";
  label: string;
  detail: string;
  complete: boolean;
  current: boolean;
  occurredAt: Date | null;
};

export function buildManagedDomainTimeline(input: { managedDomainAddOn?: boolean; managedDomainName?: string | null; managedDomainStatus?: ManagedDomainStatus | null; createdAt?: Date | null; updatedAt?: Date | null }) {
  if (!input.managedDomainAddOn) return [] as ManagedDomainTimelineItem[];
  const status = input.managedDomainStatus || "none";
  const requested = Boolean(input.managedDomainName) || ["requested", "provisioning", "active", "failed"].includes(status);
  const provisioning = ["provisioning", "active"].includes(status);
  const active = status === "active";
  const failed = status === "failed";
  return [
    { id: "service", label: "Domain service added", detail: "The managed-domain add-on is active on your subscription.", complete: true, current: false, occurredAt: input.createdAt || null },
    { id: "request", label: "Name requested", detail: input.managedDomainName ? `${input.managedDomainName} is queued for review.` : "Choose the domain name you would like us to manage.", complete: requested, current: status === "requested" || status === "none", occurredAt: requested ? input.updatedAt || null : null },
    { id: "provisioning", label: "Registration and DNS", detail: "We are coordinating registration and DNS verification.", complete: provisioning, current: status === "provisioning", occurredAt: provisioning ? input.updatedAt || null : null },
    { id: "active", label: "Live and monitored", detail: "The domain is active and ready for renewal monitoring.", complete: active, current: active, occurredAt: active ? input.updatedAt || null : null },
    { id: "failed", label: "Action needed", detail: "We could not complete the requested domain order. Choose a different name or contact support.", complete: failed, current: failed, occurredAt: failed ? input.updatedAt || null : null },
  ].filter((item) => item.id !== "failed" || failed);
}

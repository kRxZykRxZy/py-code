import { localGet, localSet } from "./localStore";

export type AdminAuditEvent = {
  id: string;
  actorUserId: number;
  targetUserId: number;
  action: "customer_updated";
  occurredAt: string;
  plan: "free" | "pro" | "proPlus";
  managedDomainAddOn: boolean;
  managedDomainStatus: "none" | "requested" | "provisioning" | "active" | "failed";
};

const key = "admin:audit-events";

export function appendAdminAudit(event: Omit<AdminAuditEvent, "id" | "occurredAt">) {
  const next: AdminAuditEvent = { ...event, id: crypto.randomUUID(), occurredAt: new Date().toISOString() };
  const entries = localGet<AdminAuditEvent[]>(key, []);
  localSet(key, [next, ...entries].slice(0, 500));
  return next;
}

export function listAdminAudit(limit = 100) {
  return localGet<AdminAuditEvent[]>(key, []).slice(0, Math.max(1, Math.min(limit, 500)));
}

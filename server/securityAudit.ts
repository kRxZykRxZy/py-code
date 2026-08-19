export type SecurityAuditAction = "oauth_started" | "oauth_denied" | "oauth_state_rejected" | "oauth_succeeded" | "oauth_failed";

export function recordSecurityAudit(action: SecurityAuditAction, outcome: "accepted" | "rejected" | "failed") {
  console.info(JSON.stringify({ level: "info", event: "security_audit", action, outcome, provider: "github", occurredAt: new Date().toISOString() }));
}

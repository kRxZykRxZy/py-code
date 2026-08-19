export type BillablePlan = "free" | "pro" | "proPlus";

const planRank: Record<BillablePlan, number> = { free: 0, pro: 1, proPlus: 2 };

export type PlanChangePreview = {
  direction: "upgrade" | "downgrade" | "unchanged";
  effectiveAt: "immediately" | "end_of_term" | "unchanged";
  requiresConfirmation: boolean;
  preserveAccessUntil: Date | null;
  message: string;
};

export function getPlanChangePreview(current: BillablePlan, target: BillablePlan, renewsAt: Date | null | undefined): PlanChangePreview {
  if (current === target) return { direction: "unchanged", effectiveAt: "unchanged", requiresConfirmation: false, preserveAccessUntil: null, message: `You are already on ${target === "proPlus" ? "Pro+" : target === "pro" ? "Pro" : "Free"}.` };
  if (planRank[target] > planRank[current]) return { direction: "upgrade", effectiveAt: "immediately", requiresConfirmation: true, preserveAccessUntil: null, message: "Your upgrade takes effect immediately. Paddle will show any prorated charge before you confirm payment." };
  return { direction: "downgrade", effectiveAt: "end_of_term", requiresConfirmation: true, preserveAccessUntil: renewsAt || null, message: renewsAt ? `Your downgrade is scheduled for the end of the current billing term on ${renewsAt.toLocaleDateString("en-US", { timeZone: "UTC" })}. Paid features remain available until then.` : "Your downgrade is scheduled for the end of the current billing term. Paid features remain available until then." };
}

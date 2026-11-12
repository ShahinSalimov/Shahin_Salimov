import type { SubscriptionPlan } from "../workspace/model";
import { getPlan } from "./plans";

/** Metered quantities for one organization. Counts are measured, never estimated. */
export interface UsageCounts {
  assets: number;
  workspaces: number;
  members: number;
  scansThisMonth: number;
  failedScansThisMonth: number;
  aiOperationsThisMonth: number;
  aiCostThisMonthUsd: number;
  connectedIntegrations: number;
  activeApiKeys: number;
}

export interface UsageLine {
  key: keyof UsageCounts;
  label: string;
  used: number;
  limit: number | null;
  /** "limited" = enforced by the database; "metered" = tracked only. */
  kind: "limited" | "metered";
}

export function usageLines(counts: UsageCounts, plan: SubscriptionPlan): UsageLine[] {
  const def = getPlan(plan);
  return [
    { key: "assets", label: "Active assets", used: counts.assets, limit: def.limits.assets, kind: "limited" },
    { key: "workspaces", label: "Workspaces", used: counts.workspaces, limit: def.limits.workspaces, kind: "limited" },
    { key: "members", label: "Team members", used: counts.members, limit: null, kind: "metered" },
    { key: "scansThisMonth", label: "Scans this month", used: counts.scansThisMonth, limit: null, kind: "metered" },
    { key: "aiOperationsThisMonth", label: "AI operations this month", used: counts.aiOperationsThisMonth, limit: null, kind: "metered" },
    { key: "connectedIntegrations", label: "Connected integrations", used: counts.connectedIntegrations, limit: null, kind: "metered" },
    { key: "activeApiKeys", label: "Active API keys", used: counts.activeApiKeys, limit: null, kind: "metered" },
  ];
}

/** First instant of the current UTC month (ISO string). */
export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Mirrors organization_limits(): no active subscription means Starter limits. */
export function effectivePlan(sub: { plan: SubscriptionPlan; status: string } | null): SubscriptionPlan {
  return sub && ["trialing", "active", "past_due"].includes(sub.status) ? sub.plan : "starter";
}

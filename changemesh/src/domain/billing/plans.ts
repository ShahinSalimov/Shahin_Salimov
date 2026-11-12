import type { SubscriptionPlan } from "../workspace/model";

/**
 * Proposed TEST prices from the product brief — not validated market prices.
 * `null` limits mean "custom / by agreement".
 */
export interface PlanDefinition {
  id: SubscriptionPlan;
  name: string;
  priceMonthlyUsd: number | null;
  tagline: string;
  limits: { workspaces: number | null; assets: number | null };
  features: string[];
}

export const PLANS: PlanDefinition[] = [
  { id: "starter", name: "Starter", priceMonthlyUsd: 19, tagline: "For a single business", limits: { workspaces: 1, assets: 25 }, features: ["1 workspace", "25 assets", "Basic scanning", "Basic change detection"] },
  { id: "business", name: "Business", priceMonthlyUsd: 59, tagline: "For multi-location teams", limits: { workspaces: 5, assets: 250 }, features: ["5 workspaces", "250 assets", "Advanced impact analysis", "Approval workflows"] },
  { id: "agency", name: "Agency", priceMonthlyUsd: 149, tagline: "For agencies managing clients", limits: { workspaces: null, assets: 1000 }, features: ["Multiple client workspaces", "1,000 assets", "Team collaboration", "Advanced reporting"] },
  { id: "enterprise", name: "Enterprise", priceMonthlyUsd: null, tagline: "For large organizations", limits: { workspaces: null, assets: null }, features: ["Custom limits", "Advanced permissions", "Dedicated support", "Enterprise integrations"] },
];

export function getPlan(id: SubscriptionPlan): PlanDefinition {
  return PLANS.find((p) => p.id === id)!;
}

/** Fraction of a limit used, or null when the limit is custom/unlimited. */
export function usageRatio(used: number, limit: number | null): number | null {
  if (limit === null) return null;
  if (limit <= 0) return 1;
  return Math.min(used / limit, 1);
}

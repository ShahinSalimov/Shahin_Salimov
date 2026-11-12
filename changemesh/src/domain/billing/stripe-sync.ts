import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "../workspace/model";

/** The subset of a Stripe Subscription object that billing needs (kept structural so it is testable). */
export interface StripeSubscriptionLike {
  id: string;
  status: string;
  customer: string | { id: string };
  cancel_at_period_end: boolean;
  metadata: Record<string, string> | null;
  items: { data: { price: { id: string }; current_period_end?: number | null }[] };
}

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "canceled", "incomplete", "incomplete_expired", "unpaid", "paused"] as const;
export type SubscriptionStatusValue = (typeof SUBSCRIPTION_STATUSES)[number];

export type PriceMap = Partial<Record<SubscriptionPlan, string>>;

export interface SubscriptionRowDraft {
  organizationId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatusValue;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export function planForPrice(priceId: string, prices: PriceMap): SubscriptionPlan | null {
  for (const plan of SUBSCRIPTION_PLANS) if (prices[plan] && prices[plan] === priceId) return plan;
  return null;
}

/**
 * Maps a Stripe subscription to our subscription row. Returns an error string
 * instead of guessing when the price or organization is unknown — the webhook
 * then records the problem rather than granting a plan.
 */
export function subscriptionFromStripe(sub: StripeSubscriptionLike, prices: PriceMap, fallbackOrganizationId?: string | null): { ok: true; row: SubscriptionRowDraft } | { ok: false; error: string } {
  const organizationId = sub.metadata?.organization_id ?? fallbackOrganizationId ?? null;
  if (!organizationId) return { ok: false, error: "Subscription has no organization_id metadata." };
  if (!(SUBSCRIPTION_STATUSES as readonly string[]).includes(sub.status)) return { ok: false, error: `Unknown subscription status "${sub.status}".` };
  const item = sub.items.data[0];
  if (!item) return { ok: false, error: "Subscription has no items." };
  const plan = planForPrice(item.price.id, prices);
  if (!plan) return { ok: false, error: `Price ${item.price.id} is not mapped to a plan (check STRIPE_PRICE_* variables).` };
  const periodEnds = sub.items.data.map((i) => i.current_period_end ?? 0).filter((n) => n > 0);
  return {
    ok: true,
    row: {
      organizationId,
      plan,
      status: sub.status as SubscriptionStatusValue,
      stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      stripeSubscriptionId: sub.id,
      stripePriceId: item.price.id,
      currentPeriodEnd: periodEnds.length ? new Date(Math.max(...periodEnds) * 1000).toISOString() : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  };
}

/** Plans that can be bought through self-serve checkout. */
export const CHECKOUT_PLANS = ["starter", "business", "agency"] as const satisfies readonly SubscriptionPlan[];
export type CheckoutPlan = (typeof CHECKOUT_PLANS)[number];

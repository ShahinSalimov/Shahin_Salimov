import "server-only";
import type Stripe from "stripe";
import { subscriptionFromStripe, type CheckoutPlan, type StripeSubscriptionLike } from "@/domain/billing/stripe-sync";
import { AppError, notConfigured } from "@/lib/errors";
import { getPublicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createServiceClient } from "../supabase/clients";
import { getStripe, getStripeConfig } from "./stripe";

function appUrl(): string {
  const url = getPublicEnv().NEXT_PUBLIC_APP_URL;
  if (!url) throw notConfigured("NEXT_PUBLIC_APP_URL must be set for Stripe redirects.");
  return url.replace(/\/$/, "");
}

function requireStripe() {
  const cfg = getStripeConfig();
  if (!cfg.configured) throw notConfigured(cfg.reason);
  return cfg;
}

async function existingCustomer(organizationId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("subscriptions").select("stripe_customer_id").eq("organization_id", organizationId).maybeSingle<{ stripe_customer_id: string | null }>();
  if (error) throw new AppError("INTERNAL", "Could not read the subscription.", { cause: error });
  return data?.stripe_customer_id ?? null;
}

/**
 * Starts a Stripe Checkout session (test mode). Nothing is granted here: the
 * plan changes only when the signed webhook confirms the subscription.
 */
export async function createCheckoutSession(input: { organizationId: string; workspaceId: string; plan: CheckoutPlan; email: string; userId: string }): Promise<string> {
  const cfg = requireStripe();
  const price = cfg.prices[input.plan];
  if (!price) throw notConfigured(`No Stripe price is configured for the ${input.plan} plan (STRIPE_PRICE_${input.plan.toUpperCase()}).`);
  const stripe = getStripe(cfg.secretKey);
  const customer = await existingCustomer(input.organizationId);
  const base = `${appUrl()}/w/${input.workspaceId}/settings/billing`;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: input.organizationId,
    ...(customer ? { customer } : { customer_email: input.email }),
    metadata: { organization_id: input.organizationId, requested_by: input.userId },
    subscription_data: { metadata: { organization_id: input.organizationId } },
    success_url: `${base}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}?checkout=cancelled`,
  });
  if (!session.url) throw new AppError("INTERNAL", "Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalSession(input: { organizationId: string; workspaceId: string }): Promise<string> {
  const cfg = requireStripe();
  const customer = await existingCustomer(input.organizationId);
  if (!customer) throw new AppError("VALIDATION_FAILED", "This organization has no Stripe customer yet. Start a subscription first.");
  const session = await getStripe(cfg.secretKey).billingPortal.sessions.create({ customer, return_url: `${appUrl()}/w/${input.workspaceId}/settings/billing` });
  return session.url;
}

export type WebhookOutcome = { status: number; body: { received: boolean; duplicate?: boolean; ignored?: string; error?: string } };

/** Verifies the Stripe signature on the raw body and applies the event idempotently. */
export async function handleStripeWebhook(rawBody: string, signature: string | null): Promise<WebhookOutcome> {
  const cfg = getStripeConfig();
  if (!cfg.configured || !cfg.webhookSecret) return { status: 503, body: { received: false, error: "Stripe webhooks are not configured." } };
  if (!signature) return { status: 400, body: { received: false, error: "Missing Stripe-Signature header." } };
  const stripe = getStripe(cfg.secretKey);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, cfg.webhookSecret);
  } catch {
    logger.warn("stripe.webhook_bad_signature");
    return { status: 400, body: { received: false, error: "Invalid signature." } };
  }
  if (event.livemode) {
    logger.error("stripe.webhook_live_event_refused", { id: event.id });
    return { status: 400, body: { received: false, error: "Live-mode events are not accepted by this build." } };
  }

  const db = createServiceClient();
  const seen = await db.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (seen.data) return { status: 200, body: { received: true, duplicate: true } };

  const apply = async (sub: StripeSubscriptionLike, fallbackOrg: string | null) => {
    const mapped = subscriptionFromStripe(sub, cfg.prices, fallbackOrg);
    if (!mapped.ok) throw new AppError("VALIDATION_FAILED", mapped.error);
    const r = mapped.row;
    const { error } = await db.from("subscriptions").upsert(
      {
        organization_id: r.organizationId,
        plan: r.plan,
        status: r.status,
        stripe_customer_id: r.stripeCustomerId,
        stripe_subscription_id: r.stripeSubscriptionId,
        stripe_price_id: r.stripePriceId,
        current_period_end: r.currentPeriodEnd,
        cancel_at_period_end: r.cancelAtPeriodEnd,
        last_event_at: new Date(event.created * 1000).toISOString(),
      },
      { onConflict: "organization_id" },
    );
    if (error) throw new AppError("INTERNAL", "Could not store the subscription.", { cause: error });
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (!subId) return await done(db, event, "checkout without subscription");
        // Re-read the subscription from Stripe so the stored state is authoritative.
        const sub = await stripe.subscriptions.retrieve(subId);
        await apply(sub as unknown as StripeSubscriptionLike, session.client_reference_id);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const sub = event.data.object as unknown as StripeSubscriptionLike & { created: number };
        // Ignore events older than what we already stored (Stripe does not guarantee order).
        const current = await db.from("subscriptions").select("last_event_at").eq("stripe_subscription_id", sub.id).maybeSingle<{ last_event_at: string | null }>();
        if (current.data?.last_event_at && new Date(current.data.last_event_at).getTime() > event.created * 1000) return await done(db, event, "stale event");
        await apply(sub, null);
        break;
      }
      case "invoice.payment_failed":
        // Status changes (past_due/unpaid) arrive through customer.subscription.updated.
        logger.warn("stripe.invoice_payment_failed", { event: event.id });
        break;
      default:
        return await done(db, event, `unhandled type ${event.type}`);
    }
  } catch (error) {
    logger.error("stripe.webhook_failed", { event: event.id, type: event.type, error });
    // 500 makes Stripe retry; the event is not marked processed.
    return { status: 500, body: { received: false, error: "Event could not be applied." } };
  }
  return done(db, event);
}

async function done(db: ReturnType<typeof createServiceClient>, event: Stripe.Event, ignored?: string): Promise<WebhookOutcome> {
  const { error } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (error && error.code !== "23505") logger.error("stripe.event_record_failed", { event: event.id, code: error.code });
  return { status: 200, body: { received: true, ...(ignored ? { ignored } : {}) } };
}

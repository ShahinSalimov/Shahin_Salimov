import "server-only";
import Stripe from "stripe";
import type { PriceMap } from "@/domain/billing/stripe-sync";
import { getServerEnv } from "../env.server";

export type StripeConfig =
  | { configured: false; reason: string }
  | { configured: true; secretKey: string; webhookSecret: string | null; prices: PriceMap };

/**
 * Billing runs in Stripe TEST MODE only. A live key is treated as a
 * configuration error so real cards can never be charged by this build.
 */
export function getStripeConfig(env = getServerEnv()): StripeConfig {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return { configured: false, reason: "Stripe is not configured (STRIPE_SECRET_KEY is empty)." };
  if (/^(sk|rk)_live_/.test(key)) return { configured: false, reason: "A live Stripe key was supplied. This build accepts test-mode keys only (sk_test_… / rk_test_…)." };
  if (!/^(sk|rk)_test_/.test(key)) return { configured: false, reason: "STRIPE_SECRET_KEY must be a test-mode key (sk_test_… or rk_test_…)." };
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET && env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_") ? env.STRIPE_WEBHOOK_SECRET : null;
  return {
    configured: true,
    secretKey: key,
    webhookSecret,
    prices: { starter: env.STRIPE_PRICE_STARTER, business: env.STRIPE_PRICE_BUSINESS, agency: env.STRIPE_PRICE_AGENCY },
  };
}

let client: { key: string; stripe: Stripe } | undefined;

export function getStripe(secretKey: string): Stripe {
  if (!client || client.key !== secretKey) client = { key: secretKey, stripe: new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000 }) };
  return client.stripe;
}

import { handleStripeWebhook } from "@/server/commercial/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe webhook endpoint. The signature is verified against the raw body. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 1_000_000) return Response.json({ received: false, error: "Payload too large." }, { status: 413 });
  const outcome = await handleStripeWebhook(raw, request.headers.get("stripe-signature"));
  return Response.json(outcome.body, { status: outcome.status });
}

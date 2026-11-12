import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { planForPrice, subscriptionFromStripe, type StripeSubscriptionLike } from "@/domain/billing/stripe-sync";
import { effectivePlan, monthStartIso, usageLines } from "@/domain/billing/usage";
import { apiKeySchema, createWorkspaceSchema, inviteSchema } from "@/domain/commercial/inputs";
import { can } from "@/domain/rbac/roles";

vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Fake service-role Supabase client: just enough for the webhook handler.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const tables: { subscriptions: Row[]; stripe_events: Row[]; [k: string]: Row[] } = { subscriptions: [], stripe_events: [] };
function fakeDb() {
  return {
    from(table: string) {
      const rows = (tables[table] ??= []);
      const filters: [string, unknown][] = [];
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return builder;
        },
        maybeSingle: async () => ({ data: rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null, error: null }),
        upsert: async (row: Row, opts: { onConflict: string }) => {
          const i = rows.findIndex((r) => r[opts.onConflict] === row[opts.onConflict]);
          if (i >= 0) rows[i] = { ...rows[i], ...row };
          else rows.push(row);
          return { error: null };
        },
        insert: async (row: Row) => {
          if (rows.some((r) => r.id === row.id)) return { error: { code: "23505", message: "duplicate" } };
          rows.push(row);
          return { error: null };
        },
      };
      return builder;
    },
  };
}
vi.mock("@/server/supabase/clients", () => ({ createServiceClient: () => fakeDb(), createUserClient: async () => fakeDb() }));

const WHSEC = "whsec_test_secret_for_unit_tests";
process.env.STRIPE_SECRET_KEY = "sk_test_unit";
process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
process.env.STRIPE_PRICE_STARTER = "price_starter";
process.env.STRIPE_PRICE_BUSINESS = "price_business";
process.env.STRIPE_PRICE_AGENCY = "price_agency";
const { getStripeConfig } = await import("@/server/commercial/stripe");
const { handleStripeWebhook } = await import("@/server/commercial/billing");
const { looksLikeApiKey, newApiKey, randomToken, sha256Hex } = await import("@/server/commercial/tokens");
const { parseServerEnv } = await import("@/server/env.server");

const sub = (over: Partial<StripeSubscriptionLike> = {}): StripeSubscriptionLike => ({
  id: "sub_1",
  status: "active",
  customer: "cus_1",
  cancel_at_period_end: false,
  metadata: { organization_id: "org-1" },
  items: { data: [{ price: { id: "price_business" }, current_period_end: 1_800_000_000 }] },
  ...over,
});
const prices = { starter: "price_starter", business: "price_business", agency: "price_agency" };

describe("stripe subscription mapping", () => {
  it("maps a subscription to our row using the configured prices", () => {
    const r = subscriptionFromStripe(sub(), prices);
    expect(r).toEqual({
      ok: true,
      row: {
        organizationId: "org-1",
        plan: "business",
        status: "active",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        stripePriceId: "price_business",
        currentPeriodEnd: new Date(1_800_000_000 * 1000).toISOString(),
        cancelAtPeriodEnd: false,
      },
    });
  });

  it("refuses unknown prices, statuses and missing organizations instead of guessing", () => {
    expect(subscriptionFromStripe(sub({ items: { data: [{ price: { id: "price_other" } }] } }), prices)).toMatchObject({ ok: false, error: expect.stringMatching(/not mapped/) });
    expect(subscriptionFromStripe(sub({ status: "weird" }), prices)).toMatchObject({ ok: false });
    expect(subscriptionFromStripe(sub({ metadata: {} }), prices)).toMatchObject({ ok: false, error: expect.stringMatching(/organization_id/) });
    expect(subscriptionFromStripe(sub({ metadata: {} }), prices, "org-2")).toMatchObject({ ok: true, row: { organizationId: "org-2" } });
    expect(planForPrice("", { starter: "" })).toBeNull();
  });
});

describe("plan limits and usage", () => {
  it("falls back to Starter without a live subscription", () => {
    expect(effectivePlan(null)).toBe("starter");
    expect(effectivePlan({ plan: "agency", status: "canceled" })).toBe("starter");
    expect(effectivePlan({ plan: "agency", status: "past_due" })).toBe("agency");
  });

  it("lists enforced and metered quantities", () => {
    const lines = usageLines({ assets: 30, workspaces: 2, members: 4, scansThisMonth: 9, failedScansThisMonth: 1, aiOperationsThisMonth: 3, aiCostThisMonthUsd: 0.2, connectedIntegrations: 0, activeApiKeys: 1 }, "business");
    expect(lines.find((l) => l.key === "assets")).toMatchObject({ used: 30, limit: 250, kind: "limited" });
    expect(lines.find((l) => l.key === "members")).toMatchObject({ limit: null, kind: "metered" });
    expect(monthStartIso(new Date("2026-11-12T10:00:00Z"))).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("commercial inputs and permissions", () => {
  it("validates invitations, API keys and workspace names", () => {
    expect(inviteSchema.parse({ email: " Ana@Example.COM ", role: "editor" })).toEqual({ email: "ana@example.com", role: "editor" });
    expect(inviteSchema.safeParse({ email: "a@b.co", role: "owner" }).success).toBe(false);
    expect(apiKeySchema.parse({ name: "POS sync", access: "read_write", expiresInDays: "never" })).toEqual({ name: "POS sync", access: "read_write", expiresInDays: null });
    expect(createWorkspaceSchema.parse({ name: "Downtown Café" })).toEqual({ name: "Downtown Café", slug: "downtown-cafe" });
  });

  it("restricts API keys and billing to admins", () => {
    expect(can("editor", "api_keys.manage")).toBe(false);
    expect(can("admin", "api_keys.manage")).toBe(true);
    expect(can("viewer", "billing.manage")).toBe(false);
  });
});

describe("tokens", () => {
  it("creates API keys whose hash is stored and whose format is checked", () => {
    const { key, prefix, hash } = newApiKey();
    expect(looksLikeApiKey(key)).toBe(true);
    expect(key.startsWith(`${prefix}_`)).toBe(true);
    expect(prefix).toMatch(/^cm_[a-z0-9]{8}$/);
    expect(hash).toBe(sha256Hex(key));
    expect(looksLikeApiKey("cm_short")).toBe(false);
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe("stripe configuration", () => {
  it("accepts test keys only", () => {
    expect(getStripeConfig(parseServerEnv({ STRIPE_SECRET_KEY: "sk_live_abc" }))).toMatchObject({ configured: false, reason: expect.stringMatching(/test-mode keys only/) });
    expect(getStripeConfig(parseServerEnv({ STRIPE_SECRET_KEY: "nope" }))).toMatchObject({ configured: false });
    expect(getStripeConfig(parseServerEnv({}))).toMatchObject({ configured: false });
    expect(getStripeConfig(parseServerEnv({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_y" }))).toMatchObject({ configured: true, webhookSecret: "whsec_y" });
  });
});

describe("stripe webhook", () => {
  const stripe = new Stripe("sk_test_unit");
  const signed = (event: Record<string, unknown>) => {
    const payload = JSON.stringify(event);
    return { payload, header: stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC }) };
  };
  const event = (id: string, type: string, object: unknown, extra: Record<string, unknown> = {}) => ({ id, object: "event", type, created: 1_790_000_000, livemode: false, data: { object }, ...extra });

  it("rejects missing and invalid signatures", async () => {
    const { payload } = signed(event("evt_a", "customer.subscription.updated", sub()));
    expect((await handleStripeWebhook(payload, null)).status).toBe(400);
    expect((await handleStripeWebhook(payload, "t=1,v1=deadbeef")).status).toBe(400);
    expect(tables.subscriptions).toHaveLength(0);
  });

  it("applies a verified subscription event once (idempotent)", async () => {
    const { payload, header } = signed(event("evt_1", "customer.subscription.updated", sub()));
    expect(await handleStripeWebhook(payload, header)).toEqual({ status: 200, body: { received: true } });
    expect(tables.subscriptions).toEqual([expect.objectContaining({ organization_id: "org-1", plan: "business", status: "active", stripe_subscription_id: "sub_1" })]);
    expect(await handleStripeWebhook(payload, header)).toEqual({ status: 200, body: { received: true, duplicate: true } });
  });

  it("ignores events older than the stored state", async () => {
    const { payload, header } = signed(event("evt_old", "customer.subscription.updated", sub({ status: "canceled" }), { created: 1_700_000_000 }));
    expect((await handleStripeWebhook(payload, header)).body.ignored).toBe("stale event");
    expect(tables.subscriptions[0]?.status).toBe("active");
  });

  it("returns 500 (so Stripe retries) when the price is not mapped, and does not mark the event processed", async () => {
    const { payload, header } = signed(event("evt_bad", "customer.subscription.updated", sub({ id: "sub_2", items: { data: [{ price: { id: "price_x" } }] } }), { created: 1_795_000_000 }));
    expect((await handleStripeWebhook(payload, header)).status).toBe(500);
    expect(tables.stripe_events.some((e) => e.id === "evt_bad")).toBe(false);
  });

  it("refuses live-mode events", async () => {
    const { payload, header } = signed(event("evt_live", "customer.subscription.updated", sub(), { livemode: true }));
    expect((await handleStripeWebhook(payload, header)).status).toBe(400);
  });
});

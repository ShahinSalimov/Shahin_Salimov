import type { Metadata } from "next";
import Link from "next/link";
import { Check, CreditCard, FlaskConical, Info } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/app/page-header";
import { SettingsNav } from "@/components/app/settings-nav";
import { UsageMeter } from "@/components/app/usage-meter";
import { BillingPortalButton, CheckoutButton } from "@/components/forms/commercial-forms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getPlan, PLANS } from "@/domain/billing/plans";
import { CHECKOUT_PLANS, type CheckoutPlan } from "@/domain/billing/stripe-sync";
import { effectivePlan } from "@/domain/billing/usage";
import { can } from "@/domain/rbac/roles";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { organizationUsage } from "@/server/commercial/service";
import { getStripeConfig } from "@/server/commercial/stripe";
import { loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const LIVE_STATUSES = ["active", "trialing", "past_due"];

export default async function BillingPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const [{ workspaceId }, { checkout }] = await Promise.all([params, searchParams]);
  const ctx = await loadWorkspace(workspaceId);
  const [snapshot, usage] = await Promise.all([loadSnapshot(ctx), organizationUsage(ctx)]);
  const base = `/w/${ctx.workspace.id}`;
  const sub = snapshot.subscription;
  const live = Boolean(sub && LIVE_STATUSES.includes(sub.status));
  const activePlan = getPlan(effectivePlan(sub));
  const isDemo = ctx.viewer.kind === "demo";
  const stripe = getStripeConfig();
  const canManage = can(ctx.role, "billing.manage");

  const checkoutBlocked = (plan: CheckoutPlan): string | undefined => {
    if (isDemo) return "Payments are disabled in the demo.";
    if (!canManage) return "Only admins and owners can change the plan.";
    if (!stripe.configured) return stripe.reason;
    if (!stripe.prices[plan]) return `No Stripe price is configured for ${plan}.`;
    return undefined;
  };

  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description={ctx.workspace.name} />
      <SettingsNav base={base} active="billing" />
      {isDemo ? (
        <Alert variant="warning">
          <FlaskConical />
          <AlertDescription>The plan shown here is sample data. No payment method exists and nothing is charged in demo mode.</AlertDescription>
        </Alert>
      ) : null}
      {checkout === "success" ? (
        <Alert>
          <Info />
          <AlertDescription>
            Stripe checkout finished. The plan changes only after Stripe confirms the subscription through its signed webhook, usually within seconds. Recorded now: <strong>{sub ? `${getPlan(sub.plan).name} · ${sub.status}` : "no subscription yet"}</strong>. Refresh to check again.
          </AlertDescription>
        </Alert>
      ) : checkout === "cancelled" ? (
        <Alert>
          <AlertDescription>Checkout was cancelled. Nothing was charged and the plan is unchanged.</AlertDescription>
        </Alert>
      ) : null}
      {!isDemo && stripe.configured ? (
        <Alert variant="warning">
          <FlaskConical />
          <AlertDescription>Stripe runs in TEST MODE. Use Stripe test cards; no real money moves.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Current plan" className="lg:col-span-1">
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xl font-semibold">{activePlan.name}</span>
              {sub ? (
                <Badge variant={sub.status === "past_due" || sub.status === "unpaid" ? "warning" : "secondary"} className="capitalize">
                  {sub.status.replace(/_/g, " ")}
                </Badge>
              ) : (
                <Badge variant="outline">No subscription</Badge>
              )}
            </div>
            {live ? (
              <>
                <p className="text-sm text-muted-foreground">{activePlan.priceMonthlyUsd !== null ? `$${activePlan.priceMonthlyUsd} / month (proposed test price)` : "Custom pricing"}</p>
                {sub?.currentPeriodEnd ? (
                  <p className="text-sm">
                    {sub.status === "trialing" ? "Trial ends" : sub.cancelAtPeriodEnd ? "Ends" : "Renews"} on <span className="font-medium">{formatDate(sub.currentPeriodEnd)}</span>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Without an active subscription the organization uses the Starter limits ({activePlan.limits.assets} assets, {activePlan.limits.workspaces} workspace).
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
            <CreditCard className="size-4 text-muted-foreground" aria-hidden="true" />
            {!isDemo && sub ? (
              <BillingPortalButton workspaceId={ctx.workspace.id} disabledReason={!canManage ? "Only admins and owners can manage billing." : stripe.configured ? undefined : stripe.reason} />
            ) : (
              <span className="text-xs text-muted-foreground">{isDemo || stripe.configured ? "Invoices and payment methods appear after the first checkout." : stripe.reason}</span>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Usage" description="Across the whole organization" className="lg:col-span-2">
          <div className="grid gap-5 sm:grid-cols-3">
            <UsageMeter label="Active assets" used={usage.assets} limit={activePlan.limits.assets} />
            <UsageMeter label="Workspaces" used={usage.workspaces} limit={activePlan.limits.workspaces} />
            <UsageMeter label="Team members" used={usage.members} limit={null} note="Metered, not limited" />
          </div>
          <p className="mt-4 border-t pt-3 text-sm">
            This month: <span className="tabular font-semibold">{usage.scansThisMonth}</span> scans · <span className="tabular font-semibold">{usage.aiOperationsThisMonth}</span> AI operations (estimated{" "}
            <span className="tabular">${usage.aiCostThisMonthUsd.toFixed(4)}</span>).{" "}
            <Link href={`${base}/settings/usage`} className="text-primary hover:underline">
              Full usage
            </Link>
          </p>
        </SectionCard>
      </div>

      <section aria-labelledby="plans-heading" className="grid gap-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="plans-heading" className="text-sm font-semibold">
            Plans
          </h2>
          <p className="text-xs text-muted-foreground">Proposed test prices, not validated market prices. USD, billed monthly.</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => {
            const current = live && sub?.plan === p.id;
            const purchasable = (CHECKOUT_PLANS as readonly string[]).includes(p.id);
            return (
              <li key={p.id} className={cn("flex flex-col rounded-xl border bg-card p-5", current && "border-primary/50 ring-1 ring-primary/30")}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  {current ? <Badge>Current</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">{p.tagline}</p>
                <p className="mt-4">
                  {p.priceMonthlyUsd !== null ? (
                    <>
                      <span className="tabular text-3xl font-semibold">${p.priceMonthlyUsd}</span>
                      <span className="text-sm text-muted-foreground"> /month</span>
                    </>
                  ) : (
                    <span className="text-3xl font-semibold">Custom</span>
                  )}
                </p>
                <ul className="mt-4 grid flex-1 gap-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  {current ? (
                    <p className="text-center text-xs text-muted-foreground">Change or cancel in the Stripe billing portal.</p>
                  ) : !purchasable ? (
                    <p className="text-center text-xs text-muted-foreground">Arranged manually — no self-serve checkout.</p>
                  ) : live ? (
                    <p className="text-center text-xs text-muted-foreground">Switch plans in the Stripe billing portal.</p>
                  ) : (
                    <CheckoutButton workspaceId={ctx.workspace.id} plan={p.id} label={`Choose ${p.name}`} variant={p.id === "business" ? "default" : "outline"} disabledReason={checkoutBlocked(p.id as CheckoutPlan)} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

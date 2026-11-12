import type { Metadata } from "next";
import { Check, CreditCard, FlaskConical } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/app/page-header";
import { SettingsNav } from "@/components/app/settings-nav";
import { PlannedTag } from "@/components/app/status-pill";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getPlan, PLANS, usageRatio } from "@/domain/billing/plans";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { loadSnapshot } from "@/server/data";
import { listWorkspaces } from "@/server/workspaces/service";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await loadWorkspace(workspaceId);
  const [snapshot, workspaces] = await Promise.all([loadSnapshot(ctx), listWorkspaces(ctx.viewer)]);
  const base = `/w/${ctx.workspace.id}`;
  const sub = snapshot.subscription;
  const plan = sub ? getPlan(sub.plan) : null;
  const orgWorkspaces = workspaces.filter((w) => w.organizationId === ctx.workspace.organizationId).length;
  const assets = snapshot.assets.filter((a) => a.status === "active").length;
  const isDemo = ctx.viewer.kind === "demo";

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

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Current plan" className="lg:col-span-1">
          {sub && plan ? (
            <div className="grid gap-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-semibold">{plan.name}</span>
                <Badge variant="secondary" className="capitalize">
                  {sub.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {plan.priceMonthlyUsd !== null ? `$${plan.priceMonthlyUsd} / month (proposed test price)` : "Custom pricing"}
              </p>
              {sub.currentPeriodEnd ? (
                <p className="text-sm">
                  {sub.status === "trialing" ? "Trial ends" : sub.cancelAtPeriodEnd ? "Ends" : "Renews"} on <span className="font-medium">{formatDate(sub.currentPeriodEnd)}</span>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-2">
              <p className="text-sm font-medium">No subscription</p>
              <p className="text-sm text-muted-foreground">This organization has no plan yet. Paid plans become available when billing launches.</p>
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
            <CreditCard className="size-4" /> Checkout and invoices <PlannedTag stage="Stage 7" />
          </div>
        </SectionCard>

        <SectionCard title="Usage" description="Against your plan limits" className="lg:col-span-2">
          <div className="grid gap-5 sm:grid-cols-3">
            <UsageMeter label="Assets in this workspace" used={assets} limit={plan?.limits.assets ?? null} />
            <UsageMeter label="Workspaces in organization" used={orgWorkspaces} limit={plan?.limits.workspaces ?? null} />
            <UsageMeter label="Members in this workspace" used={snapshot.members.length} limit={null} />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Scans, AI operations and connected integrations will be metered when those features launch.</p>
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
            const current = sub?.plan === p.id;
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
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const ratio = usageRatio(used, limit);
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">
        <span className="tabular text-xl font-semibold">{used}</span>
        <span className="text-muted-foreground"> / {limit ?? "∞"}</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit ?? undefined}>
        {ratio !== null ? <div className={cn("h-full rounded-full", ratio >= 0.9 ? "bg-destructive" : ratio >= 0.7 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.max(ratio * 100, 2)}%` }} /> : null}
      </div>
    </div>
  );
}

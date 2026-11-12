import type { Metadata } from "next";
import { PageHeader, SectionCard } from "@/components/app/page-header";
import { SettingsNav } from "@/components/app/settings-nav";
import { UsageMeter } from "@/components/app/usage-meter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getPlan } from "@/domain/billing/plans";
import { effectivePlan, usageLines } from "@/domain/billing/usage";
import { organizationUsage } from "@/server/commercial/service";
import { loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Usage" };

export default async function UsagePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await loadWorkspace(workspaceId);
  const [snapshot, counts] = await Promise.all([loadSnapshot(ctx), organizationUsage(ctx)]);
  const planId = effectivePlan(snapshot.subscription);
  const plan = getPlan(planId);
  const lines = usageLines(counts, planId);
  const base = `/w/${ctx.workspace.id}`;

  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description={ctx.workspace.name} />
      <SettingsNav base={base} active="usage" />
      {ctx.viewer.kind === "demo" ? (
        <Alert variant="warning">
          <AlertDescription>Usage is computed from the sample data in this demo session.</AlertDescription>
        </Alert>
      ) : null}
      <SectionCard title="Organization usage" description={`Measured across all workspaces of ${ctx.workspace.organizationName}. Limits come from the ${plan.name} plan${snapshot.subscription ? "" : " (applied when there is no active subscription)"}.`}>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {lines.map((l) => (
            <UsageMeter key={l.key} label={l.label} used={l.used} limit={l.limit} note={l.kind === "limited" ? "Enforced limit" : "Metered, not limited"} />
          ))}
        </div>
      </SectionCard>
      <SectionCard title="This month" description="Calendar month, UTC.">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Scans</dt>
            <dd className="tabular text-lg font-semibold">
              {counts.scansThisMonth} <span className="text-sm font-normal text-muted-foreground">({counts.failedScansThisMonth} failed)</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">AI operations</dt>
            <dd className="tabular text-lg font-semibold">{counts.aiOperationsThisMonth}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Estimated AI cost</dt>
            <dd className="tabular text-lg font-semibold">${counts.aiCostThisMonthUsd.toFixed(4)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">AI cost is estimated from list prices per model and token counts reported by the API. Rule-based analyses are free and not counted.</p>
      </SectionCard>
    </div>
  );
}

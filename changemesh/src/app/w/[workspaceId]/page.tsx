import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, CheckSquare, GitBranch, GitCompareArrows, Lock, Sparkles } from "lucide-react";
import { AssetIcon } from "@/components/app/asset-icon";
import { EmptyState } from "@/components/app/empty-state";
import { CHANGE_TYPE_META, HEALTH_META, IMPACT_META } from "@/components/app/meta";
import { PageHeader, SectionCard } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusPill } from "@/components/app/status-pill";
import { Donut, StackedBar, TrendBars } from "@/components/charts/charts";
import { ActivityFeed } from "@/components/features/activity-feed";
import { CreateAssetDialog } from "@/components/forms/create-asset-dialog";
import { CreateChangeDialog } from "@/components/forms/create-change-dialog";
import { Button } from "@/components/ui/button";
import { describeEvent } from "@/domain/insights/activity";
import { assetHealth, assetHealthSummary, dashboardMetrics, impactOverview, weeklyChangeTrend, type AssetHealth } from "@/domain/insights/metrics";
import { can } from "@/domain/rbac/roles";
import { IMPACT_LEVELS } from "@/domain/workspace/model";
import { formatDate, relativeTime } from "@/lib/format";
import { loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Overview" };

const LEVEL_COLOR = { critical: "bg-level-critical", high: "bg-level-high", medium: "bg-level-medium", low: "bg-level-low" } as const;
const HEALTH_COLOR: Record<AssetHealth, string> = { healthy: "bg-success", outdated: "bg-warning", scan_issue: "bg-destructive", unscanned: "bg-muted-foreground/40" };
const HEALTH_STROKE: Record<AssetHealth, string> = { healthy: "var(--success)", outdated: "var(--warning)", scan_issue: "var(--destructive)", unscanned: "color-mix(in oklch, var(--muted-foreground) 40%, transparent)" };

export default async function OverviewPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await loadWorkspace(workspaceId);
  const snapshot = await loadSnapshot(ctx);
  const now = new Date();
  const base = `/w/${ctx.workspace.id}`;
  const m = dashboardMetrics(snapshot, now);
  const health = assetHealthSummary(snapshot);
  const impact = impactOverview(snapshot);
  const trend = weeklyChangeTrend(snapshot.changes, now, 8);
  const canWrite = can(ctx.role, "assets.write");
  const assetOptions = snapshot.assets.map((a) => ({ id: a.id, name: a.name }));
  const attention = snapshot.assets
    .filter((a) => a.status === "active")
    .map((a) => ({ asset: a, health: assetHealth(a, snapshot) }))
    .filter((x) => x.health === "scan_issue" || x.health === "outdated")
    .sort((a, b) => (a.health === b.health ? 0 : a.health === "scan_issue" ? -1 : 1))
    .slice(0, 5);
  const activity = snapshot.audit.filter((e) => e.action !== "approvals.insert").slice(0, 7).map((e) => describeEvent(e, snapshot, base));

  if (snapshot.assets.length === 0) {
    return (
      <div className="grid gap-8">
        <PageHeader title="Welcome to your workspace" description="CHANGEMESH maps where your business information lives, so one change never leaves another asset out of date." />
        <EmptyState
          icon={Boxes}
          title="Register your first asset"
          description="Start with the place that holds your most important information — a website page, a PDF menu, a price list or a manual record."
          action={canWrite ? <CreateAssetDialog workspaceId={ctx.workspace.id} /> : <p className="text-sm text-muted-foreground">Ask an editor or admin to add assets.</p>}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={formatDate(now.toISOString())}
        title="Overview"
        description={`How consistent your business information is across ${m.totalAssets} assets.`}
        actions={
          <>
            {m.pendingApprovals > 0 ? (
              <Button asChild variant="outline">
                <Link href={`${base}/approvals`}>
                  <CheckSquare />
                  Review {m.pendingApprovals} {m.pendingApprovals === 1 ? "approval" : "approvals"}
                </Link>
              </Button>
            ) : null}
            {can(ctx.role, "changes.write") ? <CreateChangeDialog workspaceId={ctx.workspace.id} assets={assetOptions} /> : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Connected assets" value={m.connectedAssets} icon={Boxes} href={`${base}/assets`} hint={`of ${m.totalAssets} registered · ${m.totalAssets - m.connectedAssets} not linked`} />
        <StatCard label="Detected changes" value={m.detectedChanges} icon={GitBranch} href={`${base}/changes`} hint={`${m.changesLast30Days} recorded in the last 30 days`} />
        <StatCard
          label="Pending approvals"
          value={m.pendingApprovals}
          icon={CheckSquare}
          href={`${base}/approvals`}
          emphasis={m.pendingApprovals > 0 ? "warning" : undefined}
          hint={m.needsRevision ? `${m.needsRevision} waiting for revision` : "Nothing sent back"}
        />
        <StatCard
          label="Potential conflicts"
          value={m.potentialConflicts}
          icon={GitCompareArrows}
          href={`${base}/changes?type=conflicts`}
          emphasis={m.potentialConflicts > 0 ? "danger" : undefined}
          hint="Conflicting or outdated information"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3 xl:items-start">
        <SectionCard
          className="xl:col-span-2"
          title="Change impact overview"
          description="Assets affected by open changes, by impact level"
          action={
            <Link href={`${base}/changes`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              All changes <ArrowRight className="size-3" />
            </Link>
          }
        >
          <StackedBar
            label="Impacts by level"
            segments={IMPACT_LEVELS.map((l) => ({ key: l, label: IMPACT_META[l].label, value: impact.totals[l], color: LEVEL_COLOR[l] }))}
          />
          {impact.changes.length ? (
            <ul className="mt-5 divide-y rounded-lg border">
              {impact.changes.slice(0, 5).map(({ change, levels, affectedAssets, highestLevel }) => (
                <li key={change.id}>
                  <Link href={`${base}/changes/${change.id}`} className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{change.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {affectedAssets} affected {affectedAssets === 1 ? "asset" : "assets"} · {relativeTime(change.createdAt, now)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill meta={CHANGE_TYPE_META[change.type]} size="xs" />
                      {highestLevel ? <StatusPill meta={IMPACT_META[highestLevel]} size="xs" /> : <span className="text-xs text-muted-foreground">Not analyzed</span>}
                      <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted md:flex" aria-hidden="true">
                        {IMPACT_LEVELS.map((l) => (levels[l] ? <div key={l} className={LEVEL_COLOR[l]} style={{ width: `${(levels[l] / Math.max(affectedAssets, 1)) * 100}%` }} /> : null))}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">No open changes. Everything recorded so far has been resolved.</p>
          )}
        </SectionCard>

        <SectionCard title="Asset health" description="Based on scans and open changes">
          <div className="flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
            <Donut
              centerValue={health.healthy}
              centerLabel={`of ${m.totalAssets} in sync`}
              segments={(Object.keys(HEALTH_META) as AssetHealth[]).map((h) => ({ key: h, label: HEALTH_META[h].label, value: health[h], color: HEALTH_COLOR[h], stroke: HEALTH_STROKE[h] }))}
            />
            <ul className="grid w-full gap-2 text-sm">
              {(Object.keys(HEALTH_META) as AssetHealth[]).map((h) => (
                <li key={h}>
                  <Link href={`${base}/assets?health=${h}`} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted" title={HEALTH_META[h].description}>
                    <span className={`size-2 rounded-full ${HEALTH_COLOR[h]}`} aria-hidden="true" />
                    <span className="text-muted-foreground">{HEALTH_META[h].label}</span>
                    <span className="tabular ml-auto font-medium">{health[h]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {attention.length ? (
            <div className="mt-5 border-t pt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Needs attention</p>
              <ul className="grid gap-1">
                {attention.map(({ asset, health: h }) => (
                  <li key={asset.id}>
                    <Link href={`${base}/assets/${asset.id}`} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-muted">
                      <AssetIcon type={asset.type} className="size-7" />
                      <span className="min-w-0 flex-1 truncate text-sm">{asset.name}</span>
                      <StatusPill meta={HEALTH_META[h]} size="xs" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Recent activity"
          action={
            snapshot.auditVisible ? (
              <Link href={`${base}/activity`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Full history <ArrowRight className="size-3" />
              </Link>
            ) : null
          }
        >
          {!snapshot.auditVisible ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="size-4" /> The activity log is visible to admins and owners.
            </p>
          ) : activity.length ? (
            <ActivityFeed items={activity} now={now} />
          ) : (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          )}
        </SectionCard>

        <div className="grid gap-6">
          <SectionCard title="Changes per week" description="Last 8 weeks">
            <TrendBars label="Changes per week" points={trend.map((p, i) => ({ key: p.weekStart, value: p.count, caption: i === 0 ? formatDate(p.weekStart) : `Week ${i + 1}` }))} />
          </SectionCard>
          <SectionCard title="Relationship review">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="tabular font-semibold">{m.suggestedRelationships}</span> suggested {m.suggestedRelationships === 1 ? "relationship needs" : "relationships need"} a human decision.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Until someone reviews them, impacts that rely on suggestions are shown as unconfirmed and low confidence.</p>
                <Button asChild size="sm" variant="outline" className="mt-3">
                  <Link href={`${base}/graph?status=suggested`}>Review suggestions</Link>
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

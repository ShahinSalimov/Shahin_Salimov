import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Link2Off, Waypoints } from "lucide-react";
import { AssetIcon } from "@/components/app/asset-icon";
import { EmptyState } from "@/components/app/empty-state";
import { FilterChips, str, withParams } from "@/components/app/filters";
import { RELATIONSHIP_LABEL, RELATIONSHIP_STATUS_META } from "@/components/app/meta";
import { PageHeader, SectionCard } from "@/components/app/page-header";
import { PlannedTag, SampleTag, StatusPill } from "@/components/app/status-pill";
import { RelationshipReview } from "@/components/forms/relationship-review";
import { graphStats } from "@/domain/insights/graph-stats";
import { can } from "@/domain/rbac/roles";
import { RELATIONSHIP_STATUSES } from "@/domain/workspace/model";
import { percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Change Map" };

export default async function ChangeMapPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const ctx = await loadWorkspace(workspaceId);
  const snapshot = await loadSnapshot(ctx);
  const base = `/w/${ctx.workspace.id}`;
  const path = `${base}/graph`;
  const status = RELATIONSHIP_STATUSES.find((s) => s === str(sp.status));
  const assets = new Map(snapshot.assets.map((a) => [a.id, a]));
  const stats = graphStats(snapshot.assets, snapshot.relationships);
  const canReview = can(ctx.role, "relationships.write");
  const rels = snapshot.relationships
    .filter((r) => assets.has(r.sourceAssetId) && assets.has(r.targetAssetId))
    .filter((r) => !status || r.status === status)
    .sort((a, b) => (a.status === "suggested" ? -1 : 0) - (b.status === "suggested" ? -1 : 0) || b.confidence - a.confidence);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Change Map"
        description="How your assets depend on each other. Impact analysis follows confirmed relationships."
        actions={<PlannedTag stage="Interactive graph in Stage 4" />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Confirmed relationships" value={stats.confirmed} />
        <Metric label="Awaiting review" value={stats.suggested} tone={stats.suggested ? "info" : undefined} href={withParams(path, {}, { status: "suggested" })} />
        <Metric label="Graph depth" value={stats.maxDepth} hint="Longest chain, in hops" />
        <Metric label="Disconnected assets" value={stats.disconnected.length} tone={stats.disconnected.length ? "warning" : undefined} hint={`${stats.clusters.length} connected group${stats.clusters.length === 1 ? "" : "s"}`} />
      </div>

      {snapshot.relationships.length === 0 ? (
        <EmptyState icon={Waypoints} title="No relationships yet" description="Relationships appear when assets share information. Suggestions from scans arrive with the Asset Intelligence and Graph stages." />
      ) : (
        <div className="grid gap-6 xl:grid-cols-3 xl:items-start">
          <SectionCard
            className="xl:col-span-2"
            title="Relationships"
            description="Source → relationship → target"
            bodyClassName="px-0 pb-0"
          >
            <div className="px-5 pb-3">
              <FilterChips
                label="Relationship status"
                active={status ?? "all"}
                options={[
                  { value: "all", label: "All", count: snapshot.relationships.length, href: path },
                  ...RELATIONSHIP_STATUSES.map((s) => ({ value: s, label: RELATIONSHIP_STATUS_META[s].label, count: snapshot.relationships.filter((r) => r.status === s).length, href: withParams(path, {}, { status: s }) })),
                ]}
              />
            </div>
            {rels.length ? (
              <ul className="divide-y border-t">
                {rels.map((r) => {
                  const src = assets.get(r.sourceAssetId)!;
                  const tgt = assets.get(r.targetAssetId)!;
                  const label = `${src.name} ${RELATIONSHIP_LABEL[r.type]} ${tgt.name}`;
                  return (
                    <li key={r.id} className={cn("grid gap-3 px-5 py-4", r.status === "rejected" && "opacity-70")}>
                      <div className="flex flex-col gap-2 md:flex-row md:items-center">
                        <AssetChip href={`${base}/assets/${src.id}`} type={src.type} name={src.name} />
                        <span className="flex items-center gap-1.5 self-start pl-2 text-xs text-muted-foreground italic md:self-center md:pl-0">
                          <ArrowRight className="size-3.5 rotate-90 md:rotate-0" aria-hidden="true" />
                          {RELATIONSHIP_LABEL[r.type]}
                        </span>
                        <AssetChip href={`${base}/assets/${tgt.id}`} type={tgt.type} name={tgt.name} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <StatusPill meta={RELATIONSHIP_STATUS_META[r.status]} size="xs" />
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          Confidence
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                            <span className={cn("block h-full rounded-full", r.confidence >= 0.8 ? "bg-success" : r.confidence >= 0.6 ? "bg-warning" : "bg-destructive")} style={{ width: percent(r.confidence) }} />
                          </span>
                          <span className="tabular font-medium text-foreground">{percent(r.confidence)}</span>
                        </span>
                        {r.origin === "demo" ? <SampleTag /> : <span className="text-xs text-muted-foreground capitalize">{r.origin}</span>}
                        {r.status === "suggested" && canReview ? (
                          <div className="ml-auto">
                            <RelationshipReview workspaceId={ctx.workspace.id} relationshipId={r.id} label={label} />
                          </div>
                        ) : null}
                      </div>
                      {r.note ? <p className="text-xs text-muted-foreground">{r.note}</p> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="border-t px-5 py-8 text-center text-sm text-muted-foreground">No relationships with this status.</p>
            )}
          </SectionCard>

          <SectionCard title="Disconnected assets" description="Not linked by any confirmed relationship">
            {stats.disconnected.length ? (
              <ul className="grid gap-1">
                {stats.disconnected.map((a) => (
                  <li key={a.id}>
                    <Link href={`${base}/assets/${a.id}`} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-muted">
                      <AssetIcon type={a.type} className="size-7" />
                      <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link2Off className="size-4" /> Every asset is connected.
              </p>
            )}
            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">A change can only be traced to assets that are connected. Review suggestions or link these assets manually.</p>
          </SectionCard>
        </div>
      )}
    </div>
  );
}

function AssetChip({ href, type, name }: { href: string; type: Parameters<typeof AssetIcon>[0]["type"]; name: string }) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-2 py-1.5 text-sm font-medium shadow-xs transition-colors hover:border-primary/40 md:max-w-[45%]">
      <AssetIcon type={type} className="size-6 rounded-md border-0 bg-muted" />
      <span className="truncate">{name}</span>
    </Link>
  );
}

function Metric({ label, value, hint, tone, href }: { label: string; value: number; hint?: string; tone?: "info" | "warning"; href?: string }) {
  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular mt-1.5 text-2xl font-semibold", tone === "info" && "text-info", tone === "warning" && "text-[color-mix(in_oklch,var(--warning),var(--foreground)_35%)]")}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
      {body}
    </Link>
  ) : (
    <div className="rounded-xl border bg-card p-4">{body}</div>
  );
}

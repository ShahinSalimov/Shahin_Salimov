import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, FlaskConical, Info, Sparkles } from "lucide-react";
import { AssetIcon } from "@/components/app/asset-icon";
import { EmptyState } from "@/components/app/empty-state";
import { APPROVAL_META, CHANGE_STATUS_META, CHANGE_TYPE_META, EXECUTION_META, IMPACT_META } from "@/components/app/meta";
import { PageHeader, SectionCard } from "@/components/app/page-header";
import { RelationshipPath } from "@/components/app/relationship-path";
import { PlannedTag, SampleTag, StatusPill } from "@/components/app/status-pill";
import { StackedBar } from "@/components/charts/charts";
import { DecisionControls } from "@/components/forms/decision-controls";
import { countByLevel } from "@/domain/insights/metrics";
import { can } from "@/domain/rbac/roles";
import { IMPACT_LEVELS } from "@/domain/workspace/model";
import { formatDateTime, percent } from "@/lib/format";
import { loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Impact analysis" };

const LEVEL_COLOR = { critical: "bg-level-critical", high: "bg-level-high", medium: "bg-level-medium", low: "bg-level-low" } as const;
const LEVEL_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export default async function ChangeDetailPage({ params }: { params: Promise<{ workspaceId: string; changeId: string }> }) {
  const { workspaceId, changeId } = await params;
  const ctx = await loadWorkspace(workspaceId);
  const snapshot = await loadSnapshot(ctx);
  const change = snapshot.changes.find((c) => c.id === changeId);
  if (!change) notFound();
  const base = `/w/${ctx.workspace.id}`;
  const names = new Map(snapshot.assets.map((a) => [a.id, a.name]));
  const assets = new Map(snapshot.assets.map((a) => [a.id, a]));
  const impacts = snapshot.impacts.filter((i) => i.changeId === change.id).sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.confidence - a.confidence);
  const proposals = snapshot.proposals.filter((p) => p.changeId === change.id);
  const proposalFor = new Map(proposals.map((p) => [p.targetAssetId, p]));
  const levels = countByLevel(impacts);
  const canDecide = can(ctx.role, "proposals.decide");
  const source = change.sourceAssetId ? assets.get(change.sourceAssetId) : undefined;
  const direct = impacts.filter((i) => i.depth <= 1).length;

  return (
    <div className="grid gap-6">
      <Link href={`${base}/changes`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Changes
      </Link>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill meta={CHANGE_TYPE_META[change.type]} size="xs" />
            <StatusPill meta={CHANGE_STATUS_META[change.status]} size="xs" />
            {change.origin === "demo" ? <SampleTag /> : null}
            <span>Recorded {formatDateTime(change.createdAt)}</span>
          </span>
        }
        title={change.title}
        description={change.description ?? undefined}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard className="lg:col-span-2" title="Before and after">
          <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-xs font-medium text-muted-foreground">Before</p>
              <p className="mt-2 text-lg font-semibold break-words text-muted-foreground line-through decoration-muted-foreground/40">{change.oldValue ?? "—"}</p>
            </div>
            <div className="grid place-items-center text-muted-foreground" aria-hidden="true">
              <ArrowRight className="size-5 rotate-90 sm:rotate-0" />
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-xs font-medium text-primary">After</p>
              <p className="mt-2 text-lg font-semibold break-words">{change.newValue ?? "—"}</p>
            </div>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Entity</dt>
              <dd className="mt-0.5 font-medium">{change.entityName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Attribute</dt>
              <dd className="mt-0.5 font-medium">{change.attributeName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Source asset</dt>
              <dd className="mt-0.5 font-medium">
                {source ? (
                  <Link className="hover:underline" href={`${base}/assets/${source.id}`}>
                    {source.name}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="Impact summary">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="tabular text-3xl font-semibold">{new Set(impacts.map((i) => i.assetId)).size}</p>
              <p className="text-xs text-muted-foreground">affected assets</p>
            </div>
            <div>
              <p className="tabular text-3xl font-semibold">{direct}</p>
              <p className="text-xs text-muted-foreground">direct · {impacts.length - direct} indirect</p>
            </div>
          </div>
          <StackedBar compact className="mt-5" label="Impacts by level" segments={IMPACT_LEVELS.map((l) => ({ key: l, label: IMPACT_META[l].label, value: levels[l], color: LEVEL_COLOR[l] }))} />
          <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
            <p className="flex gap-1.5">
              {change.origin === "demo" ? <FlaskConical className="size-3.5 shrink-0" /> : <Info className="size-3.5 shrink-0" />}
              {change.origin === "demo"
                ? "Sample analysis written for the demo. It was not produced by AI."
                : impacts.length
                  ? "Stored analysis results."
                  : "Automatic analysis arrives with the Change Engine."}
            </p>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Affected assets"
        description="Ordered by impact level, then confidence"
        action={<Link href={`${base}/approvals`} className="text-xs font-medium text-primary hover:underline">Approval Center</Link>}
        bodyClassName="px-0 pb-0"
      >
        {impacts.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={Sparkles}
              title="No impact analysis yet"
              description="This change has not been analyzed. The Change Engine will trace it through confirmed relationships and list every affected asset with a recommended action."
              action={<PlannedTag stage="Stage 5" />}
            />
          </div>
        ) : (
          <ul className="divide-y border-t">
            {impacts.map((i) => {
              const asset = assets.get(i.assetId);
              const proposal = proposalFor.get(i.assetId);
              return (
                <li key={i.id} className="grid gap-3 px-5 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {asset ? <AssetIcon type={asset.type} /> : null}
                      <div className="min-w-0">
                        <Link href={`${base}/assets/${i.assetId}`} className="font-medium hover:underline">
                          {names.get(i.assetId) ?? "Deleted asset"}
                        </Link>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {i.oldValue ?? "—"} → <span className="font-medium text-foreground">{i.newValue ?? "—"}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      <StatusPill meta={IMPACT_META[i.level]} size="xs" />
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{i.depth <= 1 ? "Direct" : `Indirect · ${i.depth} hops`}</span>
                      <span className="tabular text-xs text-muted-foreground">Confidence {percent(i.confidence)}</span>
                    </div>
                  </div>
                  <RelationshipPath path={i.path} names={names} base={base} />
                  {i.recommendedAction ? (
                    <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <span className="font-medium">Recommended: </span>
                      {i.recommendedAction}
                    </p>
                  ) : null}
                  {proposal ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        Proposal <StatusPill meta={APPROVAL_META[proposal.approvalStatus]} size="xs" /> <StatusPill meta={EXECUTION_META[proposal.executionStatus]} size="xs" />
                      </div>
                      {canDecide && (proposal.approvalStatus === "pending" || proposal.approvalStatus === "needs_revision") ? (
                        <DecisionControls workspaceId={ctx.workspace.id} proposalId={proposal.id} target={names.get(i.assetId) ?? "asset"} compact />
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

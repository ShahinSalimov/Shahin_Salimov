import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Bot, CheckCircle2, FlaskConical, Info, ListChecks, Sparkles } from "lucide-react";
import { AssetIcon } from "@/components/app/asset-icon";
import { EmptyState } from "@/components/app/empty-state";
import { APPROVAL_META, CHANGE_STATUS_META, CHANGE_TYPE_META, EXECUTION_META, IMPACT_META } from "@/components/app/meta";
import { PageHeader, SectionCard } from "@/components/app/page-header";
import { RelationshipPath } from "@/components/app/relationship-path";
import { SampleTag, StatusPill } from "@/components/app/status-pill";
import { AnalyzeButton } from "@/components/changes/change-forms";
import { ImpactGraph } from "@/components/changes/impact-graph";
import { StackedBar } from "@/components/charts/charts";
import { DecisionControls } from "@/components/forms/decision-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buildImpactGraph } from "@/domain/changes/impact-graph";
import { countByLevel, isOpenChange } from "@/domain/insights/metrics";
import { can } from "@/domain/rbac/roles";
import { APPROVAL_STATUSES, IMPACT_LEVELS } from "@/domain/workspace/model";
import { formatDateTime, percent, relativeTime } from "@/lib/format";
import { aiStatus } from "@/server/ai";
import { loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Change details" };
// AI-assisted analysis runs in a Server Action on this route.
export const maxDuration = 120;

const LEVEL_COLOR = { critical: "bg-level-critical", high: "bg-level-high", medium: "bg-level-medium", low: "bg-level-low" } as const;
const LEVEL_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export default async function ChangeDetailPage({ params }: { params: Promise<{ workspaceId: string; changeId: string }> }) {
  const { workspaceId, changeId } = await params;
  const ctx = await loadWorkspace(workspaceId);
  const snapshot = await loadSnapshot(ctx);
  const change = snapshot.changes.find((c) => c.id === changeId);
  if (!change) notFound();
  const base = `/w/${ctx.workspace.id}`;
  const now = new Date();
  const names = new Map(snapshot.assets.map((a) => [a.id, a.name]));
  const assets = new Map(snapshot.assets.map((a) => [a.id, a]));
  const impacts = snapshot.impacts.filter((i) => i.changeId === change.id).sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.confidence - a.confidence);
  const proposals = snapshot.proposals.filter((p) => p.changeId === change.id);
  const proposalFor = new Map(proposals.map((p) => [p.targetAssetId, p]));
  const levels = countByLevel(impacts);
  const canDecide = can(ctx.role, "proposals.decide");
  const canAnalyze = can(ctx.role, "changes.write") && isOpenChange(change);
  const source = change.sourceAssetId ? assets.get(change.sourceAssetId) : undefined;
  const analysis = change.analysis ?? null;
  const notes = analysis?.notes ?? {};
  const ai = aiStatus(ctx.viewer);
  const graph = impacts.length ? buildImpactGraph(impacts, names, change.sourceAssetId) : null;
  const direct = impacts.filter((i) => i.depth <= 1 || notes[i.assetId]?.containsFact).length;

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
            {change.origin === "scan" ? <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">Detected from a new version</span> : null}
            {change.origin === "rule" ? <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">Detected by comparing assets</span> : null}
            <span>Recorded {formatDateTime(change.createdAt)}</span>
          </span>
        }
        title={change.title}
        description={change.description ?? undefined}
        actions={canAnalyze ? <AnalyzeButton workspaceId={ctx.workspace.id} changeId={change.id} analyzed={Boolean(analysis)} ai={ai} /> : null}
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
              <p className="mt-2 text-lg font-semibold break-words">{change.type === "deleted" ? "Removed" : (change.newValue ?? "—")}</p>
            </div>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Entity</dt>
              <dd className="mt-0.5 font-medium">{change.entityName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Changed attribute</dt>
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
          {analysis?.relatedFacts?.length ? (
            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Related information:</span> {analysis.relatedFacts.join(" · ")}
            </p>
          ) : null}
        </SectionCard>

        <SectionCard title="Impact summary">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="tabular text-3xl font-semibold">{impacts.length}</p>
              <p className="text-xs text-muted-foreground">affected assets</p>
            </div>
            <div>
              <p className="tabular text-3xl font-semibold">{direct}</p>
              <p className="text-xs text-muted-foreground">direct · {impacts.length - direct} indirect</p>
            </div>
          </div>
          <StackedBar compact className="mt-5" label="Impacts by level" segments={IMPACT_LEVELS.map((l) => ({ key: l, label: IMPACT_META[l].label, value: levels[l], color: LEVEL_COLOR[l] }))} />
          {analysis && (analysis.counts.alreadyUpdated || analysis.counts.inconsistencies) ? (
            <ul className="mt-4 grid gap-1 text-xs">
              {analysis.counts.alreadyUpdated ? (
                <li className="flex items-center gap-1.5 text-success">
                  <CheckCircle2 className="size-3.5" /> {analysis.counts.alreadyUpdated} already show the new value
                </li>
              ) : null}
              {analysis.counts.inconsistencies ? (
                <li className="flex items-center gap-1.5 text-destructive">
                  <AlertTriangle className="size-3.5" /> {analysis.counts.inconsistencies} show an unexpected value
                </li>
              ) : null}
            </ul>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard
        title="Analysis"
        description={change.analyzedAt ? `Last run ${relativeTime(change.analyzedAt, now)} · ${formatDateTime(change.analyzedAt)}` : "Not analyzed yet"}
        action={<AnalysisBadge kind={analysis?.generatedBy ?? null} model={analysis?.model ?? null} />}
      >
        {analysis ? (
          <div className="grid gap-3">
            <p className="text-sm text-pretty">{analysis.summary}</p>
            {analysis.warnings.length ? (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertTitle>Notes about this analysis</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {analysis.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
            {analysis.usage ? (
              <p className="text-xs text-muted-foreground">
                AI usage: {analysis.usage.inputTokens.toLocaleString("en")} input + {analysis.usage.outputTokens.toLocaleString("en")} output tokens
                {analysis.usage.costUsd !== null ? ` · estimated $${analysis.usage.costUsd.toFixed(4)}` : ""}
              </p>
            ) : null}
            <p className="flex gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Affected assets are always computed from your facts and relationships. {analysis.generatedBy === "ai" ? "AI only refined the wording and could move a level by one step." : ""} Nothing is changed or published until a proposal is approved and executed.
            </p>
          </div>
        ) : (
          <EmptyState
            icon={Sparkles}
            title="No impact analysis yet"
            description={canAnalyze ? "Run the analysis to trace this change through shared facts and confirmed relationships." : "An editor can run the analysis."}
            className="py-8"
          />
        )}
      </SectionCard>

      {graph ? (
        <SectionCard title="Impact graph" description="How the change travels from the source to each affected asset">
          <ImpactGraph nodes={graph.nodes} edges={graph.edges} />
        </SectionCard>
      ) : null}

      <SectionCard
        title="Affected assets and recommendations"
        description="Ordered by impact level, then confidence"
        action={
          <Link href={`${base}/approvals`} className="text-xs font-medium text-primary hover:underline">
            Approval Center
          </Link>
        }
        bodyClassName="px-0 pb-0"
      >
        {impacts.length === 0 ? (
          <p className="border-t px-5 py-8 text-center text-sm text-muted-foreground">{analysis ? "No other asset is affected by this change." : "Run the analysis to see affected assets."}</p>
        ) : (
          <ul className="divide-y border-t">
            {impacts.map((i) => {
              const asset = assets.get(i.assetId);
              const proposal = proposalFor.get(i.assetId);
              const note = notes[i.assetId];
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
                          {note?.containsFact === false ? (
                            <span>Connected — no matching fact found in this asset</span>
                          ) : (
                            <>
                              Shows {note?.currentValue ?? i.oldValue ?? "—"} → <span className="font-medium text-foreground">{i.newValue ?? "remove"}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      <StatusPill meta={IMPACT_META[i.level]} size="xs" />
                      {note?.inconsistent ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                          <AlertTriangle className="size-3" /> Unexpected value
                        </span>
                      ) : null}
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{i.depth <= 1 ? "Direct" : `Indirect · ${i.depth} hops`}</span>
                      <span className="tabular text-xs text-muted-foreground">Confidence {percent(i.confidence)}</span>
                    </div>
                  </div>
                  <RelationshipPath path={i.path} names={names} base={base} />
                  {i.recommendedAction ? (
                    <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <p>
                        <span className="font-medium">Recommended: </span>
                        {i.recommendedAction}
                      </p>
                      {note?.rationale ? (
                        <p className="mt-1 flex gap-1.5 text-xs text-muted-foreground">
                          <Bot className="mt-0.5 size-3.5 shrink-0" /> {note.rationale}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {note?.reasons.length ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Why this asset is affected</summary>
                      <ul className="mt-1.5 grid list-disc gap-0.5 pl-5 text-muted-foreground">
                        {note.reasons.map((r, idx) => (
                          <li key={idx}>{r}</li>
                        ))}
                      </ul>
                    </details>
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
                  ) : note?.containsFact === false ? (
                    <p className="text-xs text-muted-foreground">No proposal: verify this asset manually.</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {analysis?.skipped?.length ? (
          <div className="border-t px-5 py-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Already up to date:</span> {analysis.skipped.map((s) => names.get(s.assetId) ?? "asset").join(", ")}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Approval status" description={`${proposals.length} update proposal${proposals.length === 1 ? "" : "s"}`}>
        {proposals.length ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <ul className="flex flex-wrap gap-2">
              {APPROVAL_STATUSES.map((s) => {
                const n = proposals.filter((p) => p.approvalStatus === s).length;
                return n ? (
                  <li key={s} className="flex items-center gap-1.5 text-sm">
                    <StatusPill meta={APPROVAL_META[s]} size="xs" />
                    <span className="tabular font-medium">{n}</span>
                  </li>
                ) : null;
              })}
            </ul>
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/approvals`}>
                <ListChecks />
                Review in Approval Center
              </Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No proposals yet. Proposals are created for every affected asset that holds the changed value.</p>
        )}
      </SectionCard>
    </div>
  );
}

function AnalysisBadge({ kind, model }: { kind: "rules" | "ai" | "demo" | null; model: string | null }) {
  if (!kind) return null;
  if (kind === "ai")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
        <Sparkles className="size-3" /> AI-assisted · {model}
      </span>
    );
  if (kind === "demo")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium">
        <FlaskConical className="size-3" /> Sample analysis
      </span>
    );
  return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Rule-based · no AI</span>;
}

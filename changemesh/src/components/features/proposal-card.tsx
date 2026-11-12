import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { AssetIcon } from "@/components/app/asset-icon";
import { APPROVAL_META, EXECUTION_META, IMPACT_META } from "@/components/app/meta";
import { SampleTag, StatusPill } from "@/components/app/status-pill";
import { DecisionControls } from "@/components/forms/decision-controls";
import type { Approval, Asset, Change, UpdateProposal } from "@/domain/workspace/model";
import { formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ProposalCard({
  proposal,
  asset,
  change,
  history,
  base,
  workspaceId,
  canDecide,
  now,
  highlighted,
}: {
  proposal: UpdateProposal;
  asset: Asset | undefined;
  change: Change | undefined;
  history: Approval[];
  base: string;
  workspaceId: string;
  canDecide: boolean;
  now: Date;
  highlighted?: boolean;
}) {
  const decidable = proposal.approvalStatus === "pending" || proposal.approvalStatus === "needs_revision";
  const target = asset?.name ?? "Deleted asset";
  return (
    <article id={`proposal-${proposal.id}`} className={cn("rounded-xl border bg-card p-4 sm:p-5", highlighted && "ring-2 ring-primary/50")} aria-label={`Update proposal for ${target}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {asset ? <AssetIcon type={asset.type} /> : null}
          <div className="min-w-0">
            {asset ? (
              <Link href={`${base}/assets/${asset.id}`} className="font-medium hover:underline">
                {target}
              </Link>
            ) : (
              <span className="font-medium">{target}</span>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground">
              From{" "}
              {change ? (
                <Link href={`${base}/changes/${change.id}`} className="underline-offset-4 hover:underline">
                  {change.title}
                </Link>
              ) : (
                "a deleted change"
              )}{" "}
              · <time title={formatDateTime(proposal.createdAt)}>{relativeTime(proposal.createdAt, now)}</time>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill meta={IMPACT_META[proposal.impactLevel]} size="xs" />
          <StatusPill meta={APPROVAL_META[proposal.approvalStatus]} size="xs" />
          <StatusPill meta={EXECUTION_META[proposal.executionStatus]} size="xs" />
          {proposal.origin === "demo" ? <SampleTag /> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border bg-muted/40 px-3 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">Current value</p>
          <p className="mt-0.5 text-sm break-words">{proposal.currentValue ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-[11px] font-medium text-primary">Proposed value</p>
          <p className="mt-0.5 text-sm font-medium break-words">{proposal.proposedValue ?? "—"}</p>
        </div>
      </div>
      {proposal.reason ? <p className="mt-3 text-sm text-muted-foreground">{proposal.reason}</p> : null}
      {proposal.evidence.length ? (
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {proposal.evidence.map((e, idx) => (
            <div key={idx} className="flex gap-1.5">
              <dt className="text-muted-foreground">{e.label}:</dt>
              <dd className="font-medium">{e.detail ?? "—"}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {history.length ? (
        <ul className="mt-4 grid gap-2 border-t pt-3">
          {history.map((h) => (
            <li key={h.id} className="flex items-start gap-2 text-xs">
              <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>
                <span className="font-medium">{h.decidedByName ?? "A member"}</span> <span className="text-muted-foreground">marked it</span> {APPROVAL_META[h.decision].label.toLowerCase()}
                {h.comment ? <span className="text-muted-foreground"> — “{h.comment}”</span> : null}
                <span className="text-muted-foreground"> · {relativeTime(h.createdAt, now)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {decidable ? (
        <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          {canDecide ? (
            <DecisionControls workspaceId={workspaceId} proposalId={proposal.id} target={target} />
          ) : (
            <p className="text-xs text-muted-foreground">Only admins and owners can approve or reject proposals.</p>
          )}
          <p className="text-[11px] text-muted-foreground">Approving does not publish anything. Execution is a separate step.</p>
        </div>
      ) : null}
    </article>
  );
}

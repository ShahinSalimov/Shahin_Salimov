import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ListChecks } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { FilterChips, str, withParams } from "@/components/app/filters";
import { PageHeader } from "@/components/app/page-header";
import { ProposalCard } from "@/components/features/proposal-card";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/rbac/roles";
import type { UpdateProposal } from "@/domain/workspace/model";
import { loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Approval Center" };

const LEVEL_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const TABS = {
  pending: { label: "Pending", test: (p: UpdateProposal) => p.approvalStatus === "pending" },
  needs_revision: { label: "Needs revision", test: (p: UpdateProposal) => p.approvalStatus === "needs_revision" },
  decided: { label: "Decided", test: (p: UpdateProposal) => p.approvalStatus === "approved" || p.approvalStatus === "rejected" },
} as const;
type Tab = keyof typeof TABS;

export default async function ApprovalsPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const ctx = await loadWorkspace(workspaceId);
  const snapshot = await loadSnapshot(ctx);
  const base = `/w/${ctx.workspace.id}`;
  const path = `${base}/approvals`;
  const now = new Date();
  const tab: Tab = (Object.keys(TABS) as Tab[]).find((t) => t === str(sp.tab)) ?? "pending";
  const assets = new Map(snapshot.assets.map((a) => [a.id, a]));
  const changes = new Map(snapshot.changes.map((c) => [c.id, c]));
  const list = snapshot.proposals.filter(TABS[tab].test).sort((a, b) => LEVEL_RANK[a.impactLevel] - LEVEL_RANK[b.impactLevel] || Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const canDecide = can(ctx.role, "proposals.decide");

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Approval Center"
        description="Review proposed updates before anything is changed. Most severe first."
        actions={
          <Button asChild variant="outline">
            <Link href={`${base}/proposals`}>
              <ListChecks />
              All update proposals
            </Link>
          </Button>
        }
      />
      <FilterChips
        label="Approval status"
        active={tab}
        options={(Object.keys(TABS) as Tab[]).map((t) => ({ value: t, label: TABS[t].label, count: snapshot.proposals.filter(TABS[t].test).length, href: withParams(path, {}, { tab: t }) }))}
      />
      {list.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={tab === "pending" ? "You're all caught up" : "Nothing here"}
          description={tab === "pending" ? "No update proposals are waiting for a decision." : undefined}
        />
      ) : (
        <div className="grid gap-4">
          {list.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              asset={assets.get(p.targetAssetId)}
              change={changes.get(p.changeId)}
              history={snapshot.approvals.filter((a) => a.proposalId === p.id)}
              base={base}
              workspaceId={ctx.workspace.id}
              canDecide={canDecide}
              now={now}
            />
          ))}
        </div>
      )}
    </div>
  );
}

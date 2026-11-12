import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ListChecks } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { FilterChips, str, withParams } from "@/components/app/filters";
import { PageHeader } from "@/components/app/page-header";
import { ProposalCard } from "@/components/features/proposal-card";
import { ApprovalsNav } from "@/components/approvals/approvals-nav";
import { Button } from "@/components/ui/button";
import { executorFor } from "@/server/execution/executors";
import { previewProposal } from "@/server/execution/service";
import { getWorkspaceData } from "@/server/data";
import { can } from "@/domain/rbac/roles";
import type { UpdateProposal } from "@/domain/workspace/model";
import { loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Approval Center" };

const LEVEL_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const TABS = {
  pending: { label: "Pending", test: (p: UpdateProposal) => p.approvalStatus === "pending" },
  needs_revision: { label: "Needs revision", test: (p: UpdateProposal) => p.approvalStatus === "needs_revision" },
  ready: { label: "Ready to apply", test: (p: UpdateProposal) => p.approvalStatus === "approved" && p.executionStatus !== "completed" },
  completed: { label: "Completed", test: (p: UpdateProposal) => p.approvalStatus === "approved" && p.executionStatus === "completed" },
  rejected: { label: "Rejected", test: (p: UpdateProposal) => p.approvalStatus === "rejected" },
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
  const canRevise = can(ctx.role, "proposals.write");
  const canExecute = can(ctx.role, "proposals.execute");
  const data = getWorkspaceData(ctx);
  const execution = new Map(
    await Promise.all(
      list
        .filter((p) => p.approvalStatus === "approved" && assets.has(p.targetAssetId))
        .map(async (p) => {
          const ex = executorFor(assets.get(p.targetAssetId)!);
          const preview = await previewProposal(data, p.id).catch(() => null);
          return [p.id, { mode: ex.mode as "internal" | "manual", label: ex.label, rollbackLabel: ex.rollbackLabel, steps: preview?.steps ?? [] }] as const;
        }),
    ),
  );
  const readyCount = snapshot.proposals.filter(TABS.ready.test).length;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Approval Center"
        description="Review proposed updates, then apply the approved ones. Nothing is published automatically."
        actions={
          <Button asChild variant="outline">
            <Link href={`${base}/updates/export?format=md`} prefetch={false}>
              <ListChecks />
              Export open instructions
            </Link>
          </Button>
        }
      />
      <ApprovalsNav base={base} active="center" counts={{ ready: readyCount }} />
      <FilterChips
        label="Approval status"
        active={tab}
        options={(Object.keys(TABS) as Tab[]).map((t) => ({ value: t, label: TABS[t].label, count: snapshot.proposals.filter(TABS[t].test).length, href: withParams(path, {}, { tab: t }) }))}
      />
      {list.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={tab === "pending" ? "You're all caught up" : tab === "ready" ? "Nothing waiting to be applied" : "Nothing here"}
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
              canRevise={canRevise}
              canExecute={canExecute}
              execution={execution.get(p.id)}
              now={now}
            />
          ))}
        </div>
      )}
    </div>
  );
}

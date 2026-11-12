import type { Metadata } from "next";
import Link from "next/link";
import { FileDown, ListChecks } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { FilterChips, str, withParams } from "@/components/app/filters";
import { APPROVAL_META, EXECUTION_META, IMPACT_META } from "@/components/app/meta";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill } from "@/components/app/status-pill";
import { ApprovalsNav } from "@/components/approvals/approvals-nav";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APPROVAL_STATUSES, EXECUTION_STATUSES } from "@/domain/workspace/model";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Update proposals" };

export default async function ProposalsPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const ctx = await loadWorkspace(workspaceId);
  const snapshot = await loadSnapshot(ctx);
  const base = `/w/${ctx.workspace.id}`;
  const path = `${base}/proposals`;
  const now = new Date();
  const approval = APPROVAL_STATUSES.find((s) => s === str(sp.approval));
  const execution = EXECUTION_STATUSES.find((s) => s === str(sp.execution));
  const focus = str(sp.focus);
  const assets = new Map(snapshot.assets.map((a) => [a.id, a.name]));
  const changes = new Map(snapshot.changes.map((c) => [c.id, c.title]));
  const list = snapshot.proposals.filter((p) => (!approval || p.approvalStatus === approval) && (!execution || p.executionStatus === execution));
  const current = { approval, execution };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Update proposals"
        description="Every proposed update with its approval and execution status."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/updates/export?format=csv&scope=all`} prefetch={false}>
                <FileDown /> CSV
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/updates/export?format=md&scope=all`} prefetch={false}>
                <FileDown /> Markdown
              </Link>
            </Button>
          </>
        }
      />
      <ApprovalsNav base={base} active="proposals" />
      <div className="grid gap-2">
        <FilterChips
          label="Approval status"
          active={approval ?? "all"}
          options={[
            { value: "all", label: "Any approval", count: snapshot.proposals.length, href: withParams(path, current, { approval: undefined }) },
            ...APPROVAL_STATUSES.map((s) => ({ value: s, label: APPROVAL_META[s].label, count: snapshot.proposals.filter((p) => p.approvalStatus === s).length, href: withParams(path, current, { approval: s }) })),
          ]}
        />
        <FilterChips
          label="Execution status"
          active={execution ?? "all"}
          options={[
            { value: "all", label: "Any execution", href: withParams(path, current, { execution: undefined }) },
            ...EXECUTION_STATUSES.map((s) => ({ value: s, label: EXECUTION_META[s].label, count: snapshot.proposals.filter((p) => p.executionStatus === s).length, href: withParams(path, current, { execution: s }) })),
          ]}
        />
      </div>
      {list.length === 0 ? (
        <EmptyState icon={ListChecks} title="No proposals match" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Target asset</TableHead>
                <TableHead className="hidden md:table-cell">Update</TableHead>
                <TableHead>Impact</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead className="hidden sm:table-cell">Execution</TableHead>
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((p) => (
                <TableRow key={p.id} id={`proposal-${p.id}`} className={cn(focus === p.id && "bg-primary/5")}>
                  <TableCell className="max-w-[16rem]">
                    <Link href={`${base}/assets/${p.targetAssetId}`} className="block truncate font-medium hover:underline">
                      {assets.get(p.targetAssetId) ?? "Deleted asset"}
                    </Link>
                    <Link href={`${base}/changes/${p.changeId}`} className="block truncate text-xs text-muted-foreground hover:underline">
                      {changes.get(p.changeId) ?? "Deleted change"}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden max-w-[16rem] md:table-cell">
                    <span className="block truncate text-sm">
                      <span className="text-muted-foreground line-through decoration-muted-foreground/50">{p.currentValue ?? "—"}</span> → <span className="font-medium">{p.proposedValue ?? "—"}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusPill meta={IMPACT_META[p.impactLevel]} size="xs" />
                  </TableCell>
                  <TableCell>
                    <Link href={withParams(`${base}/approvals`, {}, { tab: p.approvalStatus === "approved" ? (p.executionStatus === "completed" ? "completed" : "ready") : p.approvalStatus })}>
                      <StatusPill meta={APPROVAL_META[p.approvalStatus]} size="xs" />
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusPill meta={EXECUTION_META[p.executionStatus]} size="xs" />
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{relativeTime(p.updatedAt, now)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

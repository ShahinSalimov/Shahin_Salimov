import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileDown, ListChecks } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { FilterChips, str, withParams } from "@/components/app/filters";
import { APPROVAL_META, EXECUTION_META, IMPACT_META } from "@/components/app/meta";
import { PageHeader } from "@/components/app/page-header";
import { PlannedTag, StatusPill } from "@/components/app/status-pill";
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
      <Link href={`${base}/approvals`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Approval Center
      </Link>
      <PageHeader
        title="Update proposals"
        description="Every proposed update with its approval and execution status."
        actions={
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileDown className="size-4" /> Exportable update instructions <PlannedTag stage="Stage 6" />
          </span>
        }
      />
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
                    <Link href={withParams(`${base}/approvals`, {}, { tab: p.approvalStatus === "pending" ? "pending" : p.approvalStatus === "needs_revision" ? "needs_revision" : "decided" })}>
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

import type { Metadata } from "next";
import Link from "next/link";
import { FileDown, History } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { FilterChips, str, withParams } from "@/components/app/filters";
import { PageHeader } from "@/components/app/page-header";
import { ApprovalsNav } from "@/components/approvals/approvals-nav";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { UpdateExecution } from "@/domain/workspace/model";
import { formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getWorkspaceData, loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Update history" };

const ACTION_LABEL: Record<UpdateExecution["action"], string> = { execute: "Applied", rollback: "Rolled back / reopened", simulate: "Preview" };
const MODE_LABEL: Record<UpdateExecution["mode"], string> = { internal: "Inside CHANGEMESH", manual: "Confirmed manually", integration: "Integration", simulation: "Dry run" };
const FILTERS = {
  all: { label: "All", test: () => true },
  applied: { label: "Applied", test: (e: UpdateExecution) => e.action === "execute" && e.status === "succeeded" },
  failed: { label: "Failed", test: (e: UpdateExecution) => e.status === "failed" },
  rollback: { label: "Rollbacks", test: (e: UpdateExecution) => e.action === "rollback" },
  simulate: { label: "Previews", test: (e: UpdateExecution) => e.action === "simulate" },
} as const;
type Filter = keyof typeof FILTERS;

function summary(e: UpdateExecution): string {
  const r = e.result;
  if (e.error) return e.error;
  if (typeof r.summary === "string") return r.summary;
  if (typeof r.note === "string") return `“${r.note}”`;
  if (typeof r.before === "string" && typeof r.after === "string") return `${r.before} → ${r.after}`;
  return e.status === "running" ? "In progress…" : "—";
}

export default async function UpdateHistoryPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const ctx = await loadWorkspace(workspaceId);
  const [snapshot, executions] = await Promise.all([loadSnapshot(ctx), getWorkspaceData(ctx).executions()]);
  const base = `/w/${ctx.workspace.id}`;
  const path = `${base}/updates`;
  const now = new Date();
  const filter: Filter = (Object.keys(FILTERS) as Filter[]).find((f) => f === str(sp.filter)) ?? "all";
  const proposals = new Map(snapshot.proposals.map((p) => [p.id, p]));
  const assets = new Map(snapshot.assets.map((a) => [a.id, a.name]));
  const changes = new Map(snapshot.changes.map((c) => [c.id, c.title]));
  const list = executions.filter(FILTERS[filter].test);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Update history"
        description="Every applied update, rollback and preview, with who did it and the result. Entries cannot be edited."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/updates/export?format=csv`} prefetch={false}>
                <FileDown /> Open instructions (CSV)
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/updates/export?format=md`} prefetch={false}>
                <FileDown /> Markdown
              </Link>
            </Button>
          </>
        }
      />
      <ApprovalsNav base={base} active="history" />
      <FilterChips
        label="Update history filter"
        active={filter}
        options={(Object.keys(FILTERS) as Filter[]).map((f) => ({ value: f, label: FILTERS[f].label, count: executions.filter(FILTERS[f].test).length, href: withParams(path, {}, { filter: f === "all" ? undefined : f }) }))}
      />
      {list.length === 0 ? (
        <EmptyState icon={History} title="No updates yet" description="Approved proposals appear here once someone applies, previews or rolls them back." />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>When</TableHead>
                <TableHead>Update</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="hidden md:table-cell">Result</TableHead>
                <TableHead className="hidden lg:table-cell">By</TableHead>
                <TableHead className="hidden xl:table-cell">Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((e) => {
                const p = proposals.get(e.proposalId);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground" title={formatDateTime(e.startedAt)}>
                      {relativeTime(e.startedAt, now)}
                    </TableCell>
                    <TableCell className="max-w-[16rem]">
                      {p ? (
                        <>
                          <Link href={`${base}/assets/${p.targetAssetId}`} className="block truncate font-medium hover:underline">
                            {assets.get(p.targetAssetId) ?? "Deleted asset"}
                          </Link>
                          <Link href={`${base}/changes/${p.changeId}`} className="block truncate text-xs text-muted-foreground hover:underline">
                            {changes.get(p.changeId) ?? "Change"}
                          </Link>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Deleted proposal</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", e.status === "failed" ? "bg-destructive/10 text-destructive" : e.status === "running" ? "bg-info/10 text-info" : e.action === "simulate" ? "bg-muted text-muted-foreground" : "bg-success/10 text-success")}>
                        {e.status === "failed" ? "Failed" : e.status === "running" ? "Running" : ACTION_LABEL[e.action]}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {MODE_LABEL[e.mode]}
                        {e.action !== "simulate" ? ` · attempt ${e.attempt}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="hidden max-w-[22rem] md:table-cell">
                      <span className={cn("block truncate text-xs", e.status === "failed" && "text-destructive")} title={summary(e)}>
                        {summary(e)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-xs lg:table-cell">{e.actorName ?? "—"}</TableCell>
                    <TableCell className="hidden font-mono text-[10px] text-muted-foreground xl:table-cell">{e.idempotencyKey.slice(0, 12)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

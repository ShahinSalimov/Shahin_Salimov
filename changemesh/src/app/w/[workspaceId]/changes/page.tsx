import type { Metadata } from "next";
import Link from "next/link";
import { GitBranch, SearchX } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { FilterChips, SearchForm, str, withParams } from "@/components/app/filters";
import { CHANGE_STATUS_META, CHANGE_TYPE_META, IMPACT_META } from "@/components/app/meta";
import { PageHeader } from "@/components/app/page-header";
import { SampleTag, StatusPill } from "@/components/app/status-pill";
import { CreateChangeDialog } from "@/components/forms/create-change-dialog";
import { DetectInconsistenciesButton } from "@/components/changes/change-forms";
import { countByLevel, isOpenChange } from "@/domain/insights/metrics";
import { can } from "@/domain/rbac/roles";
import { IMPACT_LEVELS, type Change } from "@/domain/workspace/model";
import { formatDateTime, relativeTime } from "@/lib/format";
import { loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Changes" };

const VIEWS = {
  open: { label: "Open", test: (c: Change) => isOpenChange(c) },
  conflicts: { label: "Conflicts & outdated", test: (c: Change) => isOpenChange(c) && (c.type === "conflicting" || c.type === "outdated") },
  drafts: { label: "Drafts", test: (c: Change) => c.status === "draft" },
  closed: { label: "Closed", test: (c: Change) => !isOpenChange(c) },
  all: { label: "All", test: () => true },
} as const;
type View = keyof typeof VIEWS;

export default async function ChangesPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const ctx = await loadWorkspace(workspaceId);
  const snapshot = await loadSnapshot(ctx);
  const base = `/w/${ctx.workspace.id}`;
  const path = `${base}/changes`;
  const now = new Date();
  const view: View = (Object.keys(VIEWS) as View[]).find((v) => v === str(sp.type)) ?? "open";
  const q = str(sp.q);
  const assets = new Map(snapshot.assets.map((a) => [a.id, a.name]));
  const list = snapshot.changes.filter(VIEWS[view].test).filter((c) => !q || `${c.title} ${c.entityName ?? ""} ${c.attributeName ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Changes"
        description="Every recorded change to your business information and what it affects."
        actions={
          can(ctx.role, "changes.write") ? (
            <>
              <DetectInconsistenciesButton workspaceId={ctx.workspace.id} />
              <CreateChangeDialog workspaceId={ctx.workspace.id} assets={snapshot.assets.map((a) => ({ id: a.id, name: a.name }))} />
            </>
          ) : null
        }
      />
      {snapshot.changes.length === 0 ? (
        <EmptyState icon={GitBranch} title="No changes recorded" description="Record a change — for example a new price or new opening hours — to see which assets it affects." />
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <FilterChips
              label="Change view"
              active={view}
              options={(Object.keys(VIEWS) as View[]).map((v) => ({ value: v, label: VIEWS[v].label, count: snapshot.changes.filter(VIEWS[v].test).length, href: withParams(path, { q }, { type: v }) }))}
            />
            <SearchForm action={path} defaultValue={q} placeholder="Search changes" keep={{ type: view }} />
          </div>
          {list.length === 0 ? (
            <EmptyState icon={SearchX} title="No changes in this view" />
          ) : (
            <ul className="grid gap-3">
              {list.map((c) => {
                const impacts = snapshot.impacts.filter((i) => i.changeId === c.id);
                const levels = countByLevel(impacts);
                const top = IMPACT_LEVELS.find((l) => levels[l] > 0);
                const proposals = snapshot.proposals.filter((p) => p.changeId === c.id);
                const decided = proposals.filter((p) => p.approvalStatus === "approved" || p.approvalStatus === "rejected").length;
                return (
                  <li key={c.id}>
                    <Link href={`${base}/changes/${c.id}`} className="group block rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-2 sm:p-5">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill meta={CHANGE_TYPE_META[c.type]} size="xs" />
                            <StatusPill meta={CHANGE_STATUS_META[c.status]} size="xs" />
                            {c.origin === "demo" ? <SampleTag /> : null}
                            {c.origin === "scan" ? <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">From new version</span> : null}
                            {c.origin === "rule" ? <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Detected</span> : null}
                            {c.analysis?.generatedBy === "ai" ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">AI-assisted</span> : null}
                          </div>
                          <h2 className="mt-2 font-medium group-hover:underline">{c.title}</h2>
                          {c.oldValue || c.newValue ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              <span className="line-through decoration-muted-foreground/50">{c.oldValue ?? "—"}</span> → <span className="font-medium text-foreground">{c.newValue ?? "—"}</span>
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {c.sourceAssetId ? `Source: ${assets.get(c.sourceAssetId) ?? "deleted asset"} · ` : ""}
                            <time dateTime={c.createdAt} title={formatDateTime(c.createdAt)}>
                              {relativeTime(c.createdAt, now)}
                            </time>
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-6 text-sm md:text-right">
                          <div>
                            <p className="text-xs text-muted-foreground">Impact</p>
                            <div className="mt-1">{top ? <StatusPill meta={IMPACT_META[top]} size="xs" /> : <span className="text-xs text-muted-foreground">{c.analysis ? "No impact" : "Not analyzed"}</span>}</div>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Assets</p>
                            <p className="tabular mt-0.5 font-medium">{new Set(impacts.map((i) => i.assetId)).size}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Decided</p>
                            <p className="tabular mt-0.5 font-medium">
                              {decided}/{proposals.length}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { History, Lock } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { FilterChips, str, withParams } from "@/components/app/filters";
import { PageHeader, SectionCard } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/features/activity-feed";
import { describeEvent, type ActivityCategory } from "@/domain/insights/activity";
import { formatDate } from "@/lib/format";
import { loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Activity" };

const CATEGORIES: { value: ActivityCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "changes", label: "Changes" },
  { value: "approvals", label: "Approvals" },
  { value: "assets", label: "Assets" },
  { value: "relationships", label: "Relationships" },
  { value: "team", label: "Team" },
  { value: "workspace", label: "Workspace" },
];

export default async function ActivityPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const ctx = await loadWorkspace(workspaceId);
  const snapshot = await loadSnapshot(ctx);
  const base = `/w/${ctx.workspace.id}`;
  const path = `${base}/activity`;
  const now = new Date();

  if (!snapshot.auditVisible) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Activity" />
        <EmptyState icon={Lock} title="Admins and owners only" description="The audit log records every action in this workspace. Ask an admin if you need a specific entry." />
      </div>
    );
  }

  const category = CATEGORIES.find((c) => c.value === str(sp.category))?.value ?? "all";
  const items = snapshot.audit.map((e) => describeEvent(e, snapshot, base));
  const filtered = items.filter((i) => category === "all" || i.category === category);
  const byDay = new Map<string, typeof filtered>();
  for (const item of filtered) {
    const day = item.createdAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Activity" description="Append-only audit history. Entries cannot be edited or deleted." />
      <FilterChips
        label="Activity category"
        active={category}
        options={CATEGORIES.map((c) => ({ value: c.value, label: c.label, count: c.value === "all" ? items.length : items.filter((i) => i.category === c.value).length, href: withParams(path, {}, { category: c.value === "all" ? undefined : c.value }) }))}
      />
      {filtered.length === 0 ? (
        <EmptyState icon={History} title="No activity in this category" />
      ) : (
        <div className="grid gap-4">
          {[...byDay.entries()].map(([day, list]) => (
            <SectionCard key={day} title={formatDate(`${day}T12:00:00Z`)}>
              <ActivityFeed items={list} now={now} />
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}

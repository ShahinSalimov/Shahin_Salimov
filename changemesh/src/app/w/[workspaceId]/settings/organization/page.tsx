import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, SectionCard } from "@/components/app/page-header";
import { SettingsNav } from "@/components/app/settings-nav";
import { CreateWorkspaceForm, RenameOrganizationForm } from "@/components/forms/commercial-forms";
import { Badge } from "@/components/ui/badge";
import { getPlan } from "@/domain/billing/plans";
import { effectivePlan } from "@/domain/billing/usage";
import { formatDate } from "@/lib/format";
import { getOrganization } from "@/server/commercial/service";
import { loadSnapshot } from "@/server/data";
import { listWorkspaces } from "@/server/workspaces/service";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await loadWorkspace(workspaceId);
  const memberOf = await listWorkspaces(ctx.viewer);
  const [org, snapshot] = await Promise.all([getOrganization(ctx, memberOf.map((w) => w.id)), loadSnapshot(ctx)]);
  const base = `/w/${ctx.workspace.id}`;
  const isDemo = ctx.viewer.kind === "demo";
  const orgAdmin = org.role === "owner" || org.role === "admin";
  const plan = getPlan(effectivePlan(snapshot.subscription));
  const atLimit = plan.limits.workspaces !== null && org.workspaces.length >= plan.limits.workspaces;
  const createDisabled = isDemo
    ? "The demo has a single workspace."
    : !orgAdmin
      ? "Only organization owners and admins can create workspaces."
      : atLimit
        ? `Your ${plan.name} plan includes ${plan.limits.workspaces} workspace(s). Upgrade under Billing & plan.`
        : undefined;

  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description={ctx.workspace.name} />
      <SettingsNav base={base} active="organization" />
      <SectionCard title="Organization" description={org.createdAt ? `Created ${formatDate(org.createdAt)}` : "Sample organization"}>
        <div className="grid gap-4">
          <RenameOrganizationForm workspaceId={ctx.workspace.id} name={org.name} disabledReason={isDemo ? "Read-only in the demo." : orgAdmin ? undefined : "Only organization owners and admins can rename it."} />
          <p className="text-sm text-muted-foreground">
            Your organization role: <Badge variant="secondary" className="capitalize">{org.role ?? "workspace guest"}</Badge>
          </p>
        </div>
      </SectionCard>
      <SectionCard title={`Workspaces (${org.workspaces.length}${plan.limits.workspaces !== null ? ` of ${plan.limits.workspaces}` : ""})`} description="Each workspace has its own assets, team and approvals." bodyClassName="px-0 pb-0">
        <ul className="divide-y border-y">
          {org.workspaces.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="min-w-0 truncate font-medium">{w.name}</span>
              {w.isMember ? (
                <Link href={`/w/${w.id}`} className="text-primary hover:underline">
                  Open
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">Not a member</span>
              )}
            </li>
          ))}
        </ul>
        <div className="p-5">
          <CreateWorkspaceForm workspaceId={ctx.workspace.id} disabledReason={createDisabled} />
        </div>
      </SectionCard>
    </div>
  );
}

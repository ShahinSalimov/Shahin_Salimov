import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { Avatar } from "@/components/app/avatar";
import { PageHeader, SectionCard } from "@/components/app/page-header";
import { SettingsNav } from "@/components/app/settings-nav";
import { InviteMemberForm, RevokeInvitationButton } from "@/components/forms/commercial-forms";
import { MemberRoleSelect, RemoveMemberButton } from "@/components/forms/settings-forms";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, canAssignRole, PERMISSIONS, WORKSPACE_ROLES, type Permission } from "@/domain/rbac/roles";
import { formatDate } from "@/lib/format";
import { listInvitations } from "@/server/commercial/service";
import { loadSnapshot } from "@/server/data";
import { loadWorkspace } from "@/server/workspaces/load";

export const metadata: Metadata = { title: "Team" };

const ROLE_LABEL = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" } as const;
const MATRIX: { label: string; permission: Permission }[] = [
  { label: "View workspace data", permission: "assets.view" },
  { label: "Add and edit assets, relationships, changes", permission: "assets.write" },
  { label: "Approve or reject update proposals", permission: "proposals.decide" },
  { label: "Invite and manage members, integrations, API keys", permission: "members.manage" },
  { label: "View the audit log", permission: "audit.view" },
  { label: "Delete the workspace", permission: "workspace.delete" },
];

export default async function TeamPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await loadWorkspace(workspaceId);
  const manageMembers = can(ctx.role, "members.manage");
  const [snapshot, invitations] = await Promise.all([loadSnapshot(ctx), manageMembers ? listInvitations(ctx) : Promise.resolve([])]);
  const isDemo = ctx.viewer.kind === "demo";
  const base = `/w/${ctx.workspace.id}`;
  const manage = manageMembers;
  const selfId = ctx.viewer.kind === "user" ? ctx.viewer.id : "demo-user-1";
  const assignable = WORKSPACE_ROLES.filter((r) => canAssignRole(ctx.role, r));

  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description={ctx.workspace.name} />
      <SettingsNav base={base} active="team" />
      {manage ? (
        <SectionCard title="Invite a teammate" description="Invitations are bound to one email address, can be used once and expire after 7 days.">
          <InviteMemberForm workspaceId={ctx.workspace.id} canInviteAdmin={ctx.role === "owner"} disabledReason={isDemo ? "Invitations need a real account — the demo has no real users." : undefined} />
          {invitations.length ? (
            <div className="mt-5 border-t pt-4">
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">Pending invitations ({invitations.length})</h3>
              <ul className="grid gap-2">
                {invitations.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {ROLE_LABEL[inv.role]} · {inv.status === "expired" ? <span className="text-destructive">expired {formatDate(inv.expiresAt)}</span> : <>expires {formatDate(inv.expiresAt)}</>}
                      </p>
                    </div>
                    <RevokeInvitationButton workspaceId={ctx.workspace.id} invitationId={inv.id} email={inv.email} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard title={`Members (${snapshot.members.length})`} description="People with access to this workspace" bodyClassName="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Joined</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshot.members.map((m) => {
              const name = m.fullName ?? m.email;
              const editable = manage && m.userId !== selfId && canAssignRole(ctx.role, m.role);
              return (
                <TableRow key={m.userId}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={name} id={m.userId} className="size-8" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {name} {m.userId === selfId ? <span className="text-xs font-normal text-muted-foreground">(you)</span> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{editable ? <MemberRoleSelect workspaceId={ctx.workspace.id} userId={m.userId} role={m.role} assignable={assignable} name={name} /> : <Badge variant="secondary">{ROLE_LABEL[m.role]}</Badge>}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(m.joinedAt)}</TableCell>
                  <TableCell>{editable ? <RemoveMemberButton workspaceId={ctx.workspace.id} userId={m.userId} name={name} /> : null}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title="Role permissions" description="Enforced by the database for every request." bodyClassName="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Capability</TableHead>
              {WORKSPACE_ROLES.map((r) => (
                <TableHead key={r} className="text-center">
                  {ROLE_LABEL[r]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {MATRIX.map((row) => (
              <TableRow key={row.permission}>
                <TableCell className="min-w-[14rem] text-sm">{row.label}</TableCell>
                {WORKSPACE_ROLES.map((r) => (
                  <TableCell key={r} className="text-center">
                    {can(r, row.permission) ? <Check className="mx-auto size-4 text-success" aria-label="Allowed" /> : <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Not allowed" />}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">Required minimum roles: {Object.entries(PERMISSIONS).length} permissions defined. Only owners can grant or remove the owner role.</p>
      </SectionCard>
    </div>
  );
}

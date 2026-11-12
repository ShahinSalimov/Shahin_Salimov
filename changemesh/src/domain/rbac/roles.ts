/**
 * Role-based access control. Mirrors the SQL helpers in
 * supabase/migrations/*_foundation.sql (public.has_workspace_role).
 * The database is the enforcement point (RLS); this module drives UI decisions
 * and server-side pre-checks so users get clear errors before a query runs.
 */
export const WORKSPACE_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const ORGANIZATION_ROLES = ["owner", "admin", "member"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

const WORKSPACE_RANK: Record<WorkspaceRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };
const ORGANIZATION_RANK: Record<OrganizationRole, number> = { member: 1, admin: 2, owner: 3 };

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function hasWorkspaceRole(actual: WorkspaceRole | null | undefined, minimum: WorkspaceRole): boolean {
  if (!actual) return false;
  return WORKSPACE_RANK[actual] >= WORKSPACE_RANK[minimum];
}

export function hasOrganizationRole(actual: OrganizationRole | null | undefined, minimum: OrganizationRole): boolean {
  if (!actual) return false;
  return ORGANIZATION_RANK[actual] >= ORGANIZATION_RANK[minimum];
}

export const PERMISSIONS = {
  "workspace.view": "viewer",
  "workspace.update": "admin",
  "workspace.delete": "owner",
  "members.view": "viewer",
  "members.manage": "admin",
  "assets.view": "viewer",
  "assets.write": "editor",
  "assets.delete": "editor",
  "relationships.write": "editor",
  "changes.view": "viewer",
  "changes.write": "editor",
  "proposals.write": "editor",
  "proposals.decide": "admin",
  "proposals.execute": "admin",
  "integrations.view": "viewer",
  "integrations.manage": "admin",
  "audit.view": "admin",
  "api_keys.manage": "admin",
  "billing.manage": "admin",
} as const satisfies Record<string, WorkspaceRole>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: WorkspaceRole | null | undefined, permission: Permission): boolean {
  return hasWorkspaceRole(role, PERMISSIONS[permission]);
}

/**
 * Whether `actor` may assign `targetRole` to someone (or change/remove a member
 * that currently has `targetRole`). Only owners can create or touch owners.
 */
export function canAssignRole(actor: WorkspaceRole | null | undefined, targetRole: WorkspaceRole): boolean {
  if (!hasWorkspaceRole(actor, "admin")) return false;
  if (targetRole === "owner") return actor === "owner";
  return true;
}

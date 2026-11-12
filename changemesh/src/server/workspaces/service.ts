import "server-only";
import { z } from "zod";
import { can, isWorkspaceRole, type Permission, type WorkspaceRole } from "@/domain/rbac/roles";
import { forbidden, fromPostgresError, notFound, AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { Viewer } from "../auth/session";
import { DEMO_WORKSPACE_ID, demoMembers, demoOrganization, demoViewerRole, demoWorkspace } from "../demo/fixture";
import { createUserClient } from "../supabase/clients";

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  organizationName: string;
  role: WorkspaceRole;
  isDemo: boolean;
}

export interface WorkspaceContext {
  workspace: WorkspaceSummary;
  role: WorkspaceRole;
  viewer: Viewer;
}

export interface WorkspaceMember {
  userId: string;
  fullName: string | null;
  email: string;
  role: WorkspaceRole;
}

const membershipRow = z.object({
  role: z.string().refine(isWorkspaceRole),
  workspaces: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    is_demo: z.boolean(),
    organization_id: z.string().uuid(),
    organizations: z.object({ name: z.string() }),
  }),
});

function demoSummary(): WorkspaceSummary {
  return {
    id: demoWorkspace.id,
    name: demoWorkspace.name,
    slug: demoWorkspace.slug,
    organizationId: demoOrganization.id,
    organizationName: demoOrganization.name,
    role: demoViewerRole,
    isDemo: true,
  };
}

function unexpected(op: string, error: { message?: string; code?: string }): never {
  const mapped = fromPostgresError(error);
  if (mapped) throw mapped;
  logger.error("db.query_failed", { op, code: error.code, message: error.message });
  throw new AppError("INTERNAL", "Could not load workspace data. Please try again.");
}

export async function listWorkspaces(viewer: Viewer): Promise<WorkspaceSummary[]> {
  if (viewer.kind === "demo") return [demoSummary()];
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspaces!inner(id, name, slug, is_demo, organization_id, organizations!inner(name))")
    .eq("user_id", viewer.id)
    .order("created_at", { ascending: true });
  if (error) unexpected("listWorkspaces", error);
  return (data ?? []).map((raw) => {
    const row = membershipRow.parse(raw);
    return {
      id: row.workspaces.id,
      name: row.workspaces.name,
      slug: row.workspaces.slug,
      organizationId: row.workspaces.organization_id,
      organizationName: row.workspaces.organizations.name,
      role: row.role as WorkspaceRole,
      isDemo: row.workspaces.is_demo,
    };
  });
}

/**
 * Loads a workspace the viewer belongs to and checks a permission.
 * Unknown workspaces and workspaces of other tenants both return NOT_FOUND so
 * their existence is not revealed.
 */
export async function getWorkspaceContext(viewer: Viewer, workspaceId: string, permission: Permission = "workspace.view"): Promise<WorkspaceContext> {
  let workspace: WorkspaceSummary | undefined;
  if (viewer.kind === "demo") {
    if (workspaceId !== DEMO_WORKSPACE_ID) throw notFound("Workspace not found.");
    workspace = demoSummary();
  } else {
    if (!z.string().uuid().safeParse(workspaceId).success) throw notFound("Workspace not found.");
    workspace = (await listWorkspaces(viewer)).find((w) => w.id === workspaceId);
  }
  if (!workspace) throw notFound("Workspace not found.");
  if (!can(workspace.role, permission)) throw forbidden();
  return { workspace, role: workspace.role, viewer };
}

const memberRow = z.object({
  role: z.string().refine(isWorkspaceRole),
  user_id: z.string().uuid(),
  profiles: z.object({ full_name: z.string().nullable(), email: z.string() }),
});

export async function listMembers(ctx: WorkspaceContext): Promise<WorkspaceMember[]> {
  if (ctx.viewer.kind === "demo") return demoMembers.map((m) => ({ ...m }));
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, user_id, profiles!workspace_members_user_id_fkey(full_name, email)")
    .eq("workspace_id", ctx.workspace.id)
    .order("created_at", { ascending: true });
  if (error) unexpected("listMembers", error);
  return (data ?? []).map((raw) => {
    const row = memberRow.parse(raw);
    return { userId: row.user_id, fullName: row.profiles.full_name, email: row.profiles.email, role: row.role as WorkspaceRole };
  });
}

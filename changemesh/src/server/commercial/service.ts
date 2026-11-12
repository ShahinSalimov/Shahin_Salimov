import "server-only";
import { z } from "zod";
import type { UsageCounts } from "@/domain/billing/usage";
import type { ApiKeyInput, InviteInput } from "@/domain/commercial/inputs";
import { AppError, fromPostgresError, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getDemoSession } from "../data/demo-store";
import { demoOrganization } from "../demo/fixture";
import { createUserClient } from "../supabase/clients";
import type { WorkspaceContext } from "../workspaces/service";
import { newApiKey, randomToken, sha256Hex } from "./tokens";
import type { ApiKeyView, InvitationView, NotificationView, OrganizationView } from "./views";

/** Raised for features that need a real account (invitations, API keys, billing). */
export const demoUnavailable = (what: string) => new AppError("FORBIDDEN", `${what} are not available in the demo. Create an account to use them.`);

function check<T>(op: string, res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    const mapped = fromPostgresError(res.error);
    if (mapped) throw mapped;
    logger.error("db.query_failed", { op, code: res.error.code, message: res.error.message });
    throw new AppError("INTERNAL", "Something went wrong. Please try again.");
  }
  return res.data as T;
}

const invitationRow = z.object({ id: z.string(), email: z.string(), role: z.enum(["owner", "admin", "editor", "viewer"]), created_at: z.string(), expires_at: z.string() });
const apiKeyRow = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.enum(["read", "write"])),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
});
const notificationRow = z.object({
  id: z.string(),
  kind: z.enum(["approval_needed", "revision_requested", "scan_failed", "invitation_accepted", "payment_problem", "update_failed"]),
  title: z.string(),
  body: z.string().nullable(),
  link: z.string().nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------
export async function listInvitations(ctx: WorkspaceContext): Promise<InvitationView[]> {
  if (ctx.viewer.kind === "demo") return [];
  const db = await createUserClient();
  const rows = check(
    "listInvitations",
    await db.from("invitations").select("id, email, role, created_at, expires_at").eq("workspace_id", ctx.workspace.id).is("accepted_at", null).is("revoked_at", null).order("created_at", { ascending: false }),
  );
  const now = Date.now();
  return z
    .array(invitationRow)
    .parse(rows)
    .map((r) => ({ id: r.id, email: r.email, role: r.role, createdAt: r.created_at, expiresAt: r.expires_at, status: new Date(r.expires_at).getTime() < now ? "expired" : "open" }));
}

/** Creates an invitation and returns the one-time token (only its hash is stored). */
export async function createInvitation(ctx: WorkspaceContext, input: InviteInput): Promise<{ token: string }> {
  if (ctx.viewer.kind === "demo") throw demoUnavailable("Invitations");
  if (input.email === ctx.viewer.email.toLowerCase()) throw new AppError("VALIDATION_FAILED", "You are already a member of this workspace.");
  const db = await createUserClient();
  const existing = check("inviteMemberCheck", await db.from("workspace_members").select("user_id, profiles!inner(email)").eq("workspace_id", ctx.workspace.id).ilike("profiles.email", input.email));
  if ((existing as unknown[]).length) throw new AppError("CONFLICT", "This person is already a member of the workspace.");
  const token = randomToken();
  const res = await db.from("invitations").insert({ workspace_id: ctx.workspace.id, email: input.email, role: input.role, token_hash: sha256Hex(token) });
  if (res.error?.code === "23505") throw new AppError("CONFLICT", "An open invitation for this email already exists. Revoke it to send a new one.");
  check("createInvitation", res);
  return { token };
}

export async function revokeInvitation(ctx: WorkspaceContext, id: string): Promise<void> {
  if (ctx.viewer.kind === "demo") throw demoUnavailable("Invitations");
  const db = await createUserClient();
  const rows = check("revokeInvitation", await db.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", ctx.workspace.id).select("id"));
  if (!(rows as unknown[]).length) throw notFound("Invitation not found.");
}

export interface InvitationPreview {
  workspaceName: string;
  organizationName: string;
  role: string;
  email: string;
  status: "open" | "accepted" | "revoked" | "expired";
}

export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  const db = await createUserClient();
  const rows = check("previewInvitation", await db.rpc("invitation_preview", { p_token_hash: sha256Hex(token) }));
  const row = (rows as { workspace_name: string; organization_name: string; role: string; email: string; status: InvitationPreview["status"] }[])[0];
  return row ? { workspaceName: row.workspace_name, organizationName: row.organization_name, role: row.role, email: row.email, status: row.status } : null;
}

export async function acceptInvitation(token: string): Promise<string> {
  const db = await createUserClient();
  return check<string>("acceptInvitation", await db.rpc("accept_invitation", { p_token_hash: sha256Hex(token) }));
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------
export async function listApiKeys(ctx: WorkspaceContext): Promise<ApiKeyView[]> {
  if (ctx.viewer.kind === "demo") return [];
  const db = await createUserClient();
  const now = Date.now();
  const rows = check("listApiKeys", await db.from("api_keys").select("id, name, prefix, scopes, created_at, last_used_at, expires_at, revoked_at").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }));
  return z
    .array(apiKeyRow)
    .parse(rows)
    .map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, scopes: r.scopes, createdAt: r.created_at, lastUsedAt: r.last_used_at, expiresAt: r.expires_at, revokedAt: r.revoked_at, expired: r.expires_at !== null && new Date(r.expires_at).getTime() < now }));
}

/** Returns the full secret once. It cannot be retrieved again. */
export async function createApiKey(ctx: WorkspaceContext, input: ApiKeyInput): Promise<{ key: string }> {
  if (ctx.viewer.kind === "demo") throw demoUnavailable("API keys");
  const { key, prefix, hash } = newApiKey();
  const db = await createUserClient();
  check(
    "createApiKey",
    await db.from("api_keys").insert({
      workspace_id: ctx.workspace.id,
      name: input.name,
      prefix,
      key_hash: hash,
      scopes: input.access === "read_write" ? ["read", "write"] : ["read"],
      expires_at: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString() : null,
    }),
  );
  return { key };
}

export async function revokeApiKey(ctx: WorkspaceContext, id: string): Promise<void> {
  if (ctx.viewer.kind === "demo") throw demoUnavailable("API keys");
  const db = await createUserClient();
  const rows = check("revokeApiKey", await db.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", ctx.workspace.id).is("revoked_at", null).select("id"));
  if (!(rows as unknown[]).length) throw notFound("API key not found or already revoked.");
}

// ---------------------------------------------------------------------------
// Notifications (per user, across workspaces)
// ---------------------------------------------------------------------------
export async function listNotifications(ctx: WorkspaceContext, limit = 30): Promise<NotificationView[]> {
  if (ctx.viewer.kind === "demo") return getDemoSession(ctx.viewer.sessionId).notifications ?? [];
  const db = await createUserClient();
  const rows = check("listNotifications", await db.from("notifications").select("id, kind, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(limit));
  return z
    .array(notificationRow)
    .parse(rows)
    .map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, readAt: r.read_at, createdAt: r.created_at }));
}

export async function markNotificationsRead(ctx: WorkspaceContext, id: string | "all"): Promise<void> {
  const now = new Date().toISOString();
  if (ctx.viewer.kind === "demo") {
    for (const n of getDemoSession(ctx.viewer.sessionId).notifications ?? []) if (id === "all" || n.id === id) n.readAt ??= now;
    return;
  }
  const db = await createUserClient();
  let q = db.from("notifications").update({ read_at: now }).is("read_at", null);
  if (id !== "all") q = q.eq("id", id);
  check("markNotificationsRead", await q);
}

// ---------------------------------------------------------------------------
// Organization & usage
// ---------------------------------------------------------------------------
export async function getOrganization(ctx: WorkspaceContext, memberWorkspaceIds: string[]): Promise<OrganizationView> {
  if (ctx.viewer.kind === "demo") {
    return {
      id: demoOrganization.id,
      name: demoOrganization.name,
      slug: demoOrganization.slug,
      role: "owner",
      createdAt: null,
      workspaces: [{ id: ctx.workspace.id, name: ctx.workspace.name, slug: "demo", isMember: true }],
    };
  }
  const db = await createUserClient();
  const orgId = ctx.workspace.organizationId;
  const [org, role, workspaces] = await Promise.all([
    db.from("organizations").select("id, name, slug, created_at").eq("id", orgId).single<{ id: string; name: string; slug: string; created_at: string }>(),
    db.from("organization_members").select("role").eq("organization_id", orgId).eq("user_id", ctx.viewer.id).maybeSingle<{ role: "owner" | "admin" | "member" }>(),
    db.from("workspaces").select("id, name, slug").eq("organization_id", orgId).order("created_at", { ascending: true }),
  ]);
  const o = check("getOrganization", org);
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    createdAt: o.created_at,
    role: check("getOrganizationRole", role)?.role ?? null,
    workspaces: (check("listOrgWorkspaces", workspaces) as { id: string; name: string; slug: string }[]).map((w) => ({ ...w, isMember: memberWorkspaceIds.includes(w.id) })),
  };
}

export async function renameOrganization(ctx: WorkspaceContext, name: string): Promise<void> {
  if (ctx.viewer.kind === "demo") throw demoUnavailable("Organization settings");
  const db = await createUserClient();
  const rows = check("renameOrganization", await db.from("organizations").update({ name }).eq("id", ctx.workspace.organizationId).select("id"));
  if (!(rows as unknown[]).length) throw new AppError("FORBIDDEN", "Only organization owners and admins can rename the organization.");
}

export async function createWorkspace(ctx: WorkspaceContext, input: { name: string; slug: string }): Promise<string> {
  if (ctx.viewer.kind === "demo") throw demoUnavailable("New workspaces");
  const db = await createUserClient();
  for (let i = 0; i < 5; i += 1) {
    const slug = i === 0 ? input.slug : `${input.slug.slice(0, 43)}-${Math.random().toString(36).slice(2, 6)}`;
    const res = await db.from("workspaces").insert({ organization_id: ctx.workspace.organizationId, name: input.name, slug, created_by: ctx.viewer.id }).select("id").single<{ id: string }>();
    if (res.error?.code === "23505") continue;
    if (res.error?.code === "42501") throw new AppError("FORBIDDEN", "Only organization owners and admins can create workspaces.");
    return check("createWorkspace", res).id;
  }
  throw new AppError("CONFLICT", "Could not find a free address for this workspace. Try another name.");
}

const usageRow = z.object({
  assets: z.number(),
  workspaces: z.number(),
  members: z.number(),
  scans_this_month: z.number(),
  failed_scans_this_month: z.number(),
  ai_operations_this_month: z.number(),
  ai_cost_this_month: z.union([z.number(), z.string()]).transform(Number),
  connected_integrations: z.number(),
  active_api_keys: z.number(),
});

export async function organizationUsage(ctx: WorkspaceContext): Promise<UsageCounts> {
  if (ctx.viewer.kind === "demo") {
    const s = getDemoSession(ctx.viewer.sessionId);
    const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const scans = s.scans.filter((x) => x.startedAt >= month);
    const ai = (s.aiUsage ?? []).filter((x) => x.createdAt >= month);
    return {
      assets: s.snapshot.assets.filter((a) => a.status === "active").length,
      workspaces: 1,
      members: s.snapshot.members.length,
      scansThisMonth: scans.length,
      failedScansThisMonth: scans.filter((x) => x.status === "failed").length,
      aiOperationsThisMonth: ai.length,
      aiCostThisMonthUsd: ai.reduce((sum, x) => sum + (x.costUsd ?? 0), 0),
      connectedIntegrations: s.snapshot.integrations.filter((i) => i.status === "connected").length,
      activeApiKeys: 0,
    };
  }
  const db = await createUserClient();
  const rows = check("organizationUsage", await db.rpc("organization_usage", { org: ctx.workspace.organizationId }));
  const r = usageRow.parse((rows as unknown[])[0]);
  return {
    assets: r.assets,
    workspaces: r.workspaces,
    members: r.members,
    scansThisMonth: r.scans_this_month,
    failedScansThisMonth: r.failed_scans_this_month,
    aiOperationsThisMonth: r.ai_operations_this_month,
    aiCostThisMonthUsd: r.ai_cost_this_month,
    connectedIntegrations: r.connected_integrations,
    activeApiKeys: r.active_api_keys,
  };
}

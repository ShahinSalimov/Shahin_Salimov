"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { apiKeySchema, checkoutSchema, createWorkspaceSchema, inviteSchema, organizationNameSchema } from "@/domain/commercial/inputs";
import { can, type Permission } from "@/domain/rbac/roles";
import { AppError, forbidden, type ActionResult } from "@/lib/errors";
import { getPublicEnv } from "@/lib/env";
import { formToObject, runAction } from "../action";
import { getViewer, requireUser } from "../auth/session";
import { takeToken } from "../rate-limit";
import { createUserClient } from "../supabase/clients";
import { getWorkspaceContext } from "../workspaces/service";
import { createCheckoutSession, createPortalSession } from "./billing";
import * as svc from "./service";

export type CommercialState = ActionResult<{ message?: string; secret?: string; link?: string; id?: string }> | null;

async function authorize(form: FormData, permission: Permission) {
  const viewer = await getViewer();
  if (!viewer) throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  const workspaceId = form.get("workspaceId");
  if (typeof workspaceId !== "string" || !workspaceId) throw new AppError("VALIDATION_FAILED", "Missing workspace.");
  const ctx = await getWorkspaceContext(viewer, workspaceId, "workspace.view");
  if (!can(ctx.role, permission)) throw forbidden();
  return ctx;
}

function limit(key: string, max: number, windowMs: number) {
  if (!takeToken(key, max, windowMs).ok) throw new AppError("RATE_LIMITED", "Too many requests. Please wait a moment and try again.");
}

async function inviteBaseUrl(): Promise<string> {
  const configured = getPublicEnv().NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const { headers } = await import("next/headers");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
}

export async function inviteMemberAction(_prev: CommercialState, form: FormData): Promise<CommercialState> {
  return runAction("invitation.create", async () => {
    const ctx = await authorize(form, "members.manage");
    limit(`invite:${ctx.workspace.id}`, 20, 3600_000);
    const input = inviteSchema.parse(formToObject(form));
    if (ctx.role !== "owner" && input.role === "admin") throw forbidden("Only workspace owners can invite admins.");
    const { token } = await svc.createInvitation(ctx, input);
    revalidatePath(`/w/${ctx.workspace.id}/settings/team`);
    return {
      link: `${await inviteBaseUrl()}/invite/${token}`,
      message: `Invitation created for ${input.email}. Email delivery is not configured — copy the link and send it yourself. It is shown only once.`,
    };
  });
}

export async function revokeInvitationAction(_prev: CommercialState, form: FormData): Promise<CommercialState> {
  return runAction("invitation.revoke", async () => {
    const ctx = await authorize(form, "members.manage");
    await svc.revokeInvitation(ctx, z.string().uuid().parse(form.get("invitationId")));
    revalidatePath(`/w/${ctx.workspace.id}/settings/team`);
    return { message: "Invitation revoked. The link no longer works." };
  });
}

export async function acceptInvitationAction(_prev: CommercialState, form: FormData): Promise<CommercialState> {
  const token = z.string().min(20).max(100).safeParse(form.get("token"));
  const result = await runAction("invitation.accept", async () => {
    const user = await requireUser(token.success ? `/invite/${token.data}` : "/app");
    limit(`accept:${user.id}`, 10, 600_000);
    if (!token.success) throw new AppError("VALIDATION_FAILED", "This invitation link is not valid.");
    return { id: await svc.acceptInvitation(token.data) };
  });
  if (result.ok && result.data.id) redirect(`/w/${result.data.id}`);
  return result;
}

export async function createApiKeyAction(_prev: CommercialState, form: FormData): Promise<CommercialState> {
  return runAction("api_key.create", async () => {
    const ctx = await authorize(form, "api_keys.manage");
    limit(`apikey:${ctx.workspace.id}`, 10, 3600_000);
    const { key } = await svc.createApiKey(ctx, apiKeySchema.parse(formToObject(form)));
    revalidatePath(`/w/${ctx.workspace.id}/settings/api`);
    return { secret: key, message: "API key created. Copy it now — it will not be shown again." };
  });
}

export async function revokeApiKeyAction(_prev: CommercialState, form: FormData): Promise<CommercialState> {
  return runAction("api_key.revoke", async () => {
    const ctx = await authorize(form, "api_keys.manage");
    await svc.revokeApiKey(ctx, z.string().uuid().parse(form.get("keyId")));
    revalidatePath(`/w/${ctx.workspace.id}/settings/api`);
    return { message: "API key revoked. Requests using it are now refused." };
  });
}

export async function markNotificationsReadAction(_prev: CommercialState, form: FormData): Promise<CommercialState> {
  return runAction("notifications.read", async () => {
    const ctx = await authorize(form, "workspace.view");
    const id = form.get("notificationId");
    await svc.markNotificationsRead(ctx, typeof id === "string" && id ? id : "all");
    revalidatePath(`/w/${ctx.workspace.id}`, "layout");
    return {};
  });
}

export async function renameOrganizationAction(_prev: CommercialState, form: FormData): Promise<CommercialState> {
  return runAction("organization.rename", async () => {
    const ctx = await authorize(form, "workspace.view");
    await svc.renameOrganization(ctx, organizationNameSchema.parse(formToObject(form)).name);
    revalidatePath(`/w/${ctx.workspace.id}`, "layout");
    return { message: "Organization renamed." };
  });
}

export async function createWorkspaceAction(_prev: CommercialState, form: FormData): Promise<CommercialState> {
  return runAction("workspace.create", async () => {
    const ctx = await authorize(form, "workspace.view");
    const id = await svc.createWorkspace(ctx, createWorkspaceSchema.parse(formToObject(form)));
    revalidatePath("/", "layout");
    return { id, message: "Workspace created." };
  });
}

async function requireOrgBillingRole(ctx: Awaited<ReturnType<typeof authorize>>) {
  if (ctx.viewer.kind !== "user") throw svc.demoUnavailable("Payments");
  const db = await createUserClient();
  const { data } = await db.from("organization_members").select("role").eq("organization_id", ctx.workspace.organizationId).eq("user_id", ctx.viewer.id).maybeSingle<{ role: string }>();
  if (!data || !["owner", "admin"].includes(data.role)) throw forbidden("Only organization owners and admins can manage billing.");
  return ctx.viewer;
}

export async function startCheckoutAction(_prev: CommercialState, form: FormData): Promise<CommercialState> {
  const result = await runAction("billing.checkout", async () => {
    const ctx = await authorize(form, "billing.manage");
    const user = await requireOrgBillingRole(ctx);
    limit(`checkout:${ctx.workspace.organizationId}`, 10, 600_000);
    const { plan } = checkoutSchema.parse(formToObject(form));
    return { link: await createCheckoutSession({ organizationId: ctx.workspace.organizationId, workspaceId: ctx.workspace.id, plan, email: user.email, userId: user.id }) };
  });
  if (result.ok && result.data.link) redirect(result.data.link);
  return result;
}

export async function openBillingPortalAction(_prev: CommercialState, form: FormData): Promise<CommercialState> {
  const result = await runAction("billing.portal", async () => {
    const ctx = await authorize(form, "billing.manage");
    await requireOrgBillingRole(ctx);
    return { link: await createPortalSession({ organizationId: ctx.workspace.organizationId, workspaceId: ctx.workspace.id }) };
  });
  if (result.ok && result.data.link) redirect(result.data.link);
  return result;
}

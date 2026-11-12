"use server";

import { revalidatePath } from "next/cache";
import { can, canAssignRole, type Permission } from "@/domain/rbac/roles";
import {
  createAssetSchema,
  createChangeSchema,
  decisionSchema,
  memberRoleSchema,
  relationshipReviewSchema,
  removeMemberSchema,
  renameWorkspaceSchema,
  updateProfileSchema,
} from "@/domain/workspace/inputs";
import { AppError, forbidden, type ActionResult } from "@/lib/errors";
import { LOCALE_COOKIE } from "@/i18n/config";
import { cookies } from "next/headers";
import { formToObject, runAction } from "../action";
import { getViewer } from "../auth/session";
import { getWorkspaceData } from "../data";
import { createUserClient } from "../supabase/clients";
import { getWorkspaceContext } from "./service";

export type MutationState = ActionResult<{ id?: string; message?: string }> | null;

async function authorize(workspaceId: string, permission: Permission) {
  const viewer = await getViewer();
  if (!viewer) throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  const ctx = await getWorkspaceContext(viewer, workspaceId, "workspace.view");
  if (!can(ctx.role, permission)) throw forbidden();
  return { ctx, data: getWorkspaceData(ctx) };
}

function workspaceIdFrom(form: FormData): string {
  const id = form.get("workspaceId");
  if (typeof id !== "string" || !id) throw new AppError("VALIDATION_FAILED", "Missing workspace.");
  return id;
}

export async function createAssetAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("asset.create", async () => {
    const workspaceId = workspaceIdFrom(form);
    const { data } = await authorize(workspaceId, "assets.write");
    const { id } = await data.createAsset(createAssetSchema.parse(formToObject(form)));
    revalidatePath(`/w/${workspaceId}`, "layout");
    return { id, message: "Asset registered. It has not been scanned yet." };
  });
}

export async function createChangeAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("change.create", async () => {
    const workspaceId = workspaceIdFrom(form);
    const { data } = await authorize(workspaceId, "changes.write");
    const { id } = await data.createChange(createChangeSchema.parse(formToObject(form)));
    revalidatePath(`/w/${workspaceId}`, "layout");
    return { id, message: "Change recorded as a draft. Impact analysis is not run yet." };
  });
}

export async function decideProposalAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("proposal.decide", async () => {
    const workspaceId = workspaceIdFrom(form);
    const { data } = await authorize(workspaceId, "proposals.decide");
    const input = decisionSchema.parse(formToObject(form));
    await data.decideProposal(input);
    revalidatePath(`/w/${workspaceId}`, "layout");
    const verb = { approved: "approved", rejected: "rejected", needs_revision: "sent back for revision" }[input.decision];
    return { id: input.proposalId, message: `Proposal ${verb}. Nothing was published externally.` };
  });
}

export async function reviewRelationshipAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("relationship.review", async () => {
    const workspaceId = workspaceIdFrom(form);
    const { data } = await authorize(workspaceId, "relationships.write");
    const input = relationshipReviewSchema.parse(formToObject(form));
    await data.reviewRelationship(input.relationshipId, input.status);
    revalidatePath(`/w/${workspaceId}`, "layout");
    return { id: input.relationshipId, message: input.status === "confirmed" ? "Relationship confirmed." : "Relationship rejected." };
  });
}

export async function updateMemberRoleAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("member.update_role", async () => {
    const workspaceId = workspaceIdFrom(form);
    const { ctx, data } = await authorize(workspaceId, "members.manage");
    const input = memberRoleSchema.parse(formToObject(form));
    const target = (await data.snapshot()).members.find((m) => m.userId === input.userId);
    if (!target) throw new AppError("NOT_FOUND", "Member not found.");
    if (!canAssignRole(ctx.role, input.role) || !canAssignRole(ctx.role, target.role)) throw forbidden("Only owners can grant or change the owner role.");
    await data.updateMemberRole(input.userId, input.role);
    revalidatePath(`/w/${workspaceId}`, "layout");
    return { message: "Role updated." };
  });
}

export async function removeMemberAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("member.remove", async () => {
    const workspaceId = workspaceIdFrom(form);
    const { ctx, data } = await authorize(workspaceId, "members.manage");
    const input = removeMemberSchema.parse(formToObject(form));
    const target = (await data.snapshot()).members.find((m) => m.userId === input.userId);
    if (!target) throw new AppError("NOT_FOUND", "Member not found.");
    if (!canAssignRole(ctx.role, target.role)) throw forbidden("Only owners can remove an owner.");
    await data.removeMember(input.userId);
    revalidatePath(`/w/${workspaceId}`, "layout");
    return { message: "Member removed from this workspace." };
  });
}

export async function renameWorkspaceAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("workspace.rename", async () => {
    const workspaceId = workspaceIdFrom(form);
    const { data } = await authorize(workspaceId, "workspace.update");
    const input = renameWorkspaceSchema.parse(formToObject(form));
    await data.renameWorkspace(input.name);
    revalidatePath(`/w/${workspaceId}`, "layout");
    return { message: "Workspace renamed." };
  });
}

export async function updateProfileAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("profile.update", async () => {
    const viewer = await getViewer();
    if (!viewer || viewer.kind !== "user") throw new AppError("FORBIDDEN", "Profiles are only available for real accounts.");
    const input = updateProfileSchema.parse(formToObject(form));
    const db = await createUserClient();
    const { error } = await db.from("profiles").update({ full_name: input.fullName, locale: input.locale }).eq("id", viewer.id);
    if (error) throw new AppError("INTERNAL", "Could not save your profile.", { cause: error });
    (await cookies()).set(LOCALE_COOKIE, input.locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    revalidatePath("/", "layout");
    return { message: "Profile saved." };
  });
}

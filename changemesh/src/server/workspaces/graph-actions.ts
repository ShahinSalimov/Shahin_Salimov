"use server";

import { revalidatePath } from "next/cache";
import { can, type Permission } from "@/domain/rbac/roles";
import { createRelationshipSchema, relationshipIdSchema } from "@/domain/workspace/inputs";
import { AppError, forbidden } from "@/lib/errors";
import { formToObject, runAction } from "../action";
import { getViewer } from "../auth/session";
import { getWorkspaceData } from "../data";
import { refreshSuggestions } from "../graph";
import { takeToken } from "../rate-limit";
import { getWorkspaceContext } from "./service";
import type { MutationState } from "./mutations";

async function authorize(form: FormData, permission: Permission) {
  const workspaceId = form.get("workspaceId");
  if (typeof workspaceId !== "string" || !workspaceId) throw new AppError("VALIDATION_FAILED", "Missing workspace.");
  const viewer = await getViewer();
  if (!viewer) throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  const ctx = await getWorkspaceContext(viewer, workspaceId, "workspace.view");
  if (!can(ctx.role, permission)) throw forbidden();
  return { data: getWorkspaceData(ctx), workspaceId, actorKey: viewer.kind === "user" ? viewer.id : `demo:${viewer.sessionId}` };
}

export async function createRelationshipAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("relationship.create", async () => {
    const { data, workspaceId } = await authorize(form, "relationships.write");
    const input = createRelationshipSchema.parse(formToObject(form));
    const assets = new Set((await data.snapshot()).assets.map((a) => a.id));
    if (!assets.has(input.sourceAssetId) || !assets.has(input.targetAssetId)) throw new AppError("NOT_FOUND", "Asset not found.");
    const { id } = await data.createRelationship(input);
    revalidatePath(`/w/${workspaceId}`, "layout");
    return { id, message: "Relationship created and confirmed." };
  });
}

export async function deleteRelationshipAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("relationship.delete", async () => {
    const { data, workspaceId } = await authorize(form, "relationships.write");
    const { relationshipId } = relationshipIdSchema.parse(formToObject(form));
    await data.deleteRelationship(relationshipId);
    revalidatePath(`/w/${workspaceId}`, "layout");
    return { message: "Relationship removed." };
  });
}

export async function suggestRelationshipsAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("relationship.suggest", async () => {
    const { data, workspaceId, actorKey } = await authorize(form, "relationships.write");
    const t = takeToken(`suggest:${actorKey}`, 6, 60_000);
    if (!t.ok) throw new AppError("RATE_LIMITED", `Please wait ${Math.ceil(t.retryAfterMs / 1000)} s before analyzing again.`);
    const created = await refreshSuggestions(data);
    revalidatePath(`/w/${workspaceId}`, "layout");
    return {
      message: created
        ? `${created} new relationship suggestion${created === 1 ? "" : "s"} found. Review them before they count as confirmed.`
        : "No new relationships found. Pairs you already reviewed are never suggested again.",
    };
  });
}

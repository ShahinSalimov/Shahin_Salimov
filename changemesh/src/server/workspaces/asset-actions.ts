"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, type Permission } from "@/domain/rbac/roles";
import { makeFact } from "@/domain/extraction/fact";
import { assetIdSchema, deleteAssetSchema, deleteFactSchema, manualFactSchema, updateAssetSchema } from "@/domain/workspace/inputs";
import { AppError, forbidden } from "@/lib/errors";
import { formToObject, runAction } from "../action";
import { getViewer } from "../auth/session";
import { getWorkspaceData } from "../data";
import { UPLOAD_LIMITS } from "../intelligence/files";
import { refreshSuggestionsSafely } from "../graph";
import { ingestUpload, scanWebsite } from "../intelligence/runner";
import { takeToken } from "../rate-limit";
import { getWorkspaceContext } from "./service";
import type { MutationState } from "./mutations";

const SCANS_PER_MINUTE = 10;

async function authorize(form: FormData, permission: Permission) {
  const workspaceId = form.get("workspaceId");
  if (typeof workspaceId !== "string" || !workspaceId) throw new AppError("VALIDATION_FAILED", "Missing workspace.");
  const viewer = await getViewer();
  if (!viewer) throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  const ctx = await getWorkspaceContext(viewer, workspaceId, "workspace.view");
  if (!can(ctx.role, permission)) throw forbidden();
  const data = getWorkspaceData(ctx);
  return { ctx, data, workspaceId, actorKey: viewer.kind === "user" ? viewer.id : `demo:${viewer.sessionId}` };
}

async function loadAsset(data: Awaited<ReturnType<typeof authorize>>["data"], assetId: string) {
  const asset = (await data.snapshot()).assets.find((a) => a.id === assetId);
  if (!asset) throw new AppError("NOT_FOUND", "Asset not found.");
  return asset;
}

function limitScans(actorKey: string) {
  const t = takeToken(`scan:${actorKey}`, SCANS_PER_MINUTE, 60_000);
  if (!t.ok) throw new AppError("RATE_LIMITED", `Too many scans. Try again in ${Math.ceil(t.retryAfterMs / 1000)} s.`);
}

export async function updateAssetAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("asset.update", async () => {
    const { data, workspaceId } = await authorize(form, "assets.write");
    const input = updateAssetSchema.parse(formToObject(form));
    const asset = await loadAsset(data, input.assetId);
    if (asset.type === "website" && !input.sourceUrl) throw new AppError("VALIDATION_FAILED", "Websites need a URL.", { fieldErrors: { sourceUrl: ["Websites need a URL."] } });
    await data.updateAsset(input);
    revalidatePath(`/w/${workspaceId}`, "layout");
    return { message: "Asset details saved." };
  });
}

export async function deleteAssetAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  let target: string | null = null;
  const result = await runAction("asset.delete", async () => {
    const { data, workspaceId } = await authorize(form, "assets.delete");
    const input = deleteAssetSchema.parse(formToObject(form));
    const asset = await loadAsset(data, input.assetId);
    if (input.confirmName !== asset.name.trim()) throw new AppError("VALIDATION_FAILED", "The name does not match.", { fieldErrors: { confirmName: ["Type the exact asset name to confirm."] } });
    await data.deleteAsset(asset.id);
    revalidatePath(`/w/${workspaceId}`, "layout");
    target = `/w/${workspaceId}/assets`;
    return { message: `“${asset.name}” was deleted with its versions, facts and scans.` };
  });
  if (result.ok && target) redirect(target);
  return result;
}

export async function scanAssetAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("asset.scan", async () => {
    const { ctx, data, workspaceId, actorKey } = await authorize(form, "assets.write");
    const { assetId } = assetIdSchema.parse(formToObject(form));
    if (ctx.viewer.kind === "demo") {
      throw new AppError("FORBIDDEN", "Demo mode does not fetch external websites. Upload a PDF or CSV to try extraction, or create an account to scan real pages.");
    }
    const asset = await loadAsset(data, assetId);
    if (!asset.sourceUrl) throw new AppError("VALIDATION_FAILED", "Add a URL to this asset before scanning.");
    limitScans(actorKey);
    const outcome = await scanWebsite(data, asset);
    // New facts may connect this asset to others: refresh suggestions (never blocks the scan result).
    const suggested = outcome.status !== "failed" && outcome.newVersion ? await refreshSuggestionsSafely(data) : 0;
    revalidatePath(`/w/${workspaceId}`, "layout");
    if (outcome.status === "failed") throw new AppError("VALIDATION_FAILED", outcome.message);
    const extra = suggested ? ` ${suggested} new relationship suggestion${suggested === 1 ? "" : "s"} in the Change Map.` : "";
    return { message: outcome.message + extra, tone: outcome.status === "partial" ? ("warning" as const) : undefined };
  });
}

export async function uploadAssetFileAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("asset.upload", async () => {
    const { data, workspaceId, actorKey } = await authorize(form, "assets.write");
    const { assetId } = assetIdSchema.parse(formToObject(form));
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION_FAILED", "Choose a file to upload.", { fieldErrors: { file: ["Choose a file to upload."] } });
    if (file.size > UPLOAD_LIMITS.maxBytes) throw new AppError("VALIDATION_FAILED", `The file is larger than ${UPLOAD_LIMITS.maxBytes / 1024 / 1024} MB.`, { fieldErrors: { file: ["Maximum size is 10 MB."] } });
    const asset = await loadAsset(data, assetId);
    if (asset.type === "manual") throw new AppError("VALIDATION_FAILED", "Manual records hold facts entered by people; files cannot be uploaded to them.");
    limitScans(actorKey);
    const outcome = await ingestUpload(data, asset, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    // New facts may connect this asset to others: refresh suggestions (never blocks the scan result).
    const suggested = outcome.status !== "failed" && outcome.newVersion ? await refreshSuggestionsSafely(data) : 0;
    revalidatePath(`/w/${workspaceId}`, "layout");
    if (outcome.status === "failed") throw new AppError("VALIDATION_FAILED", outcome.message);
    const extra = suggested ? ` ${suggested} new relationship suggestion${suggested === 1 ? "" : "s"} in the Change Map.` : "";
    return { message: outcome.message + extra, tone: outcome.status === "partial" ? ("warning" as const) : undefined };
  });
}

export async function addManualFactAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("fact.add", async () => {
    const { data, workspaceId } = await authorize(form, "assets.write");
    const input = manualFactSchema.parse(formToObject(form));
    await loadAsset(data, input.assetId);
    const fact = makeFact(input.entityName, input.attributeName, input.value, { kind: "manual" }, 1, "manual");
    if (!fact) throw new AppError("VALIDATION_FAILED", "The fact is empty after removing unsupported characters.");
    await data.addManualFact(input.assetId, fact);
    revalidatePath(`/w/${workspaceId}`, "layout");
    return { message: `Saved: ${fact.entityName} · ${fact.attributeName} = ${fact.valueText}` };
  });
}

export async function deleteFactAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("fact.delete", async () => {
    const { data, workspaceId } = await authorize(form, "assets.write");
    const { factId } = deleteFactSchema.parse(formToObject(form));
    await data.deleteFact(factId);
    revalidatePath(`/w/${workspaceId}`, "layout");
    return { message: "Fact removed." };
  });
}

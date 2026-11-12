"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, type Permission } from "@/domain/rbac/roles";
import { AppError, forbidden } from "@/lib/errors";
import { formToObject, runAction } from "../action";
import { getViewer } from "../auth/session";
import { detectInconsistencies, runImpactAnalysis } from "../changes/engine";
import { getWorkspaceData } from "../data";
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
  return { viewer, data: getWorkspaceData(ctx), workspaceId, actorKey: viewer.kind === "user" ? viewer.id : `demo:${viewer.sessionId}` };
}

const analyzeSchema = z.object({ changeId: z.string().min(1).max(64), useAi: z.enum(["on", "true"]).optional() });

export async function analyzeChangeAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("change.analyze", async () => {
    const { viewer, data, workspaceId, actorKey } = await authorize(form, "changes.write");
    const input = analyzeSchema.parse(formToObject(form));
    const useAi = Boolean(input.useAi);
    // AI calls cost money: stricter limit than rule-based runs.
    const t = takeToken(`analyze:${useAi ? "ai" : "rules"}:${actorKey}`, useAi ? 5 : 20, 60_000);
    if (!t.ok) throw new AppError("RATE_LIMITED", `Too many analyses. Try again in ${Math.ceil(t.retryAfterMs / 1000)} s.`);
    const out = await runImpactAnalysis(data, viewer, input.changeId, { useAi });
    revalidatePath(`/w/${workspaceId}`, "layout");
    const by = out.generatedBy === "ai" ? "AI-assisted analysis" : "Rule-based analysis";
    return {
      id: input.changeId,
      message: `${by} complete: ${out.impacts} affected asset${out.impacts === 1 ? "" : "s"}, ${out.proposalsCreated} new update proposal${out.proposalsCreated === 1 ? "" : "s"}.${out.aiError ? ` AI failed (${out.aiError}) — rules were used.` : ""}`,
      tone: out.aiError ? ("warning" as const) : undefined,
    };
  });
}

export async function detectInconsistenciesAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("change.detect_inconsistencies", async () => {
    const { viewer, data, workspaceId, actorKey } = await authorize(form, "changes.write");
    const t = takeToken(`detect:${actorKey}`, 6, 60_000);
    if (!t.ok) throw new AppError("RATE_LIMITED", `Please wait ${Math.ceil(t.retryAfterMs / 1000)} s.`);
    const { created, existing } = await detectInconsistencies(data, viewer);
    revalidatePath(`/w/${workspaceId}`, "layout");
    return {
      message: created
        ? `${created} inconsistenc${created === 1 ? "y" : "ies"} recorded as change${created === 1 ? "" : "s"} and analyzed.${existing ? ` ${existing} already had an open change.` : ""}`
        : existing
          ? `No new inconsistencies. ${existing} already have an open change.`
          : "No inconsistencies found between assets.",
    };
  });
}

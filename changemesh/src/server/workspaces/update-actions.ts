"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, type Permission } from "@/domain/rbac/roles";
import { AppError, forbidden } from "@/lib/errors";
import { formToObject, runAction } from "../action";
import { getViewer } from "../auth/session";
import { getWorkspaceData } from "../data";
import { executeProposal, rollbackProposal, simulateProposal } from "../execution/service";
import { takeToken } from "../rate-limit";
import { getWorkspaceContext } from "./service";
import type { MutationState } from "./mutations";

async function authorize(form: FormData, permission: Permission) {
  const workspaceId = form.get("workspaceId");
  if (typeof workspaceId !== "string" || !workspaceId) throw new AppError("VALIDATION_FAILED", "Missing workspace.");
  const viewer = await getViewer();
  if (!viewer) throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  const ctx = await getWorkspaceContext(viewer, workspaceId, "workspace.view");
  // Permission is verified before any execution; the database checks it again.
  if (!can(ctx.role, permission)) throw forbidden(permission === "proposals.execute" ? "Only admins and owners can execute or roll back updates." : undefined);
  return { data: getWorkspaceData(ctx), workspaceId, actorKey: viewer.kind === "user" ? viewer.id : `demo:${viewer.sessionId}` };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const reviseSchema = z.object({
  proposalId: z.string().min(1).max(64),
  proposedValue: optionalText(4000),
  reason: optionalText(4000),
  note: z.string().trim().min(3, "Describe what you changed.").max(500),
});
const proposalSchema = z.object({ proposalId: z.string().min(1).max(64), note: optionalText(500) });

function done(workspaceId: string) {
  revalidatePath(`/w/${workspaceId}`, "layout");
}

export async function reviseProposalAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("proposal.revise", async () => {
    const { data, workspaceId } = await authorize(form, "proposals.write");
    const input = reviseSchema.parse(formToObject(form));
    await data.reviseProposal(input.proposalId, { proposedValue: input.proposedValue, reason: input.reason, note: input.note });
    done(workspaceId);
    return { message: "Revision submitted. The proposal is waiting for approval again." };
  });
}

export async function executeProposalAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("proposal.execute", async () => {
    const { data, workspaceId, actorKey } = await authorize(form, "proposals.execute");
    const input = proposalSchema.parse(formToObject(form));
    const t = takeToken(`execute:${actorKey}`, 30, 60_000);
    if (!t.ok) throw new AppError("RATE_LIMITED", "Too many executions in a short time. Wait a moment.");
    const out = await executeProposal(data, input.proposalId, input.note);
    done(workspaceId);
    if (!out.succeeded) throw new AppError("VALIDATION_FAILED", out.message);
    return { message: out.message };
  });
}

export async function rollbackProposalAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("proposal.rollback", async () => {
    const { data, workspaceId } = await authorize(form, "proposals.execute");
    const input = proposalSchema.parse(formToObject(form));
    const out = await rollbackProposal(data, input.proposalId);
    done(workspaceId);
    if (!out.succeeded) throw new AppError("VALIDATION_FAILED", out.message);
    return { message: out.message };
  });
}

export async function simulateProposalAction(_prev: MutationState, form: FormData): Promise<MutationState> {
  return runAction("proposal.simulate", async () => {
    const { data, workspaceId } = await authorize(form, "proposals.write");
    const input = proposalSchema.parse(formToObject(form));
    const preview = await simulateProposal(data, input.proposalId);
    done(workspaceId);
    return { message: `Preview: ${preview.target} — ${preview.before} → ${preview.after}. Nothing was changed.` };
  });
}

import "server-only";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { WorkspaceData } from "../data/source";
import { ExecutionError, executorFor, type ExecutionContext, type Preview } from "./executors";

async function context(data: WorkspaceData, proposalId: string, note: string | null): Promise<ExecutionContext> {
  const snapshot = await data.snapshot();
  const proposal = snapshot.proposals.find((p) => p.id === proposalId);
  if (!proposal) throw new AppError("NOT_FOUND", "Proposal not found.");
  const asset = snapshot.assets.find((a) => a.id === proposal.targetAssetId);
  if (!asset) throw new AppError("VALIDATION_FAILED", "The target asset no longer exists.");
  const change = snapshot.changes.find((c) => c.id === proposal.changeId);
  if (!change) throw new AppError("VALIDATION_FAILED", "The change behind this proposal no longer exists.");
  return { data, proposal, asset, change, note };
}

export interface ExecutionOutcome {
  status: string;
  succeeded: boolean;
  message: string;
}

/**
 * Executes an approved proposal. The database claims the proposal first
 * (approved only, admin only, one execution at a time), so a double click or a
 * second tab cannot apply the same update twice. Failures are recorded, never hidden.
 */
export async function executeProposal(data: WorkspaceData, proposalId: string, note: string | null): Promise<ExecutionOutcome> {
  const ctx = await context(data, proposalId, note);
  const executor = executorFor(ctx.asset);
  if (ctx.proposal.approvalStatus !== "approved") throw new AppError("VALIDATION_FAILED", "Only approved proposals can be executed.");
  // Validate input before claiming, so a missing note does not create a failed attempt.
  if (executor.mode === "manual" && !note?.trim()) throw new AppError("VALIDATION_FAILED", "Describe how the update was applied.", { fieldErrors: { note: ["Describe how the update was applied."] } });

  const claim = await data.startExecution(proposalId, "execute", executor.mode);
  try {
    const result = await executor.execute(ctx, claim.idempotencyKey);
    const status = await data.finishExecution(claim.executionId, true, result, null);
    return { status, succeeded: true, message: executor.mode === "internal" ? `Update applied to ${ctx.asset.name}.` : `Marked as applied for ${ctx.asset.name}. Rescan it to verify.` };
  } catch (error) {
    const message = error instanceof ExecutionError ? error.message : "The update could not be completed because of an unexpected error. Nothing was confirmed; check the target and retry.";
    if (!(error instanceof ExecutionError)) logger.error("execution.failed", { proposalId, error });
    const status = await data.finishExecution(claim.executionId, false, {}, message);
    return { status, succeeded: false, message: `Update failed: ${message}` };
  }
}

export async function rollbackProposal(data: WorkspaceData, proposalId: string): Promise<ExecutionOutcome> {
  const ctx = await context(data, proposalId, null);
  const executor = executorFor(ctx.asset);
  if (!executor.rollback) throw new AppError("VALIDATION_FAILED", "This update cannot be rolled back.");
  const previous = (ctx.proposal.executionResult ?? {}) as Record<string, unknown>;
  const claim = await data.startExecution(proposalId, "rollback", executor.mode);
  try {
    const result = await executor.rollback(ctx, previous);
    const status = await data.finishExecution(claim.executionId, true, result, null);
    return { status, succeeded: true, message: executor.mode === "internal" ? `Update undone for ${ctx.asset.name}.` : `Reopened: ${ctx.asset.name} is marked as not applied.` };
  } catch (error) {
    const message = error instanceof ExecutionError ? error.message : "The rollback failed because of an unexpected error. The applied update is still in place.";
    if (!(error instanceof ExecutionError)) logger.error("execution.rollback_failed", { proposalId, error });
    const status = await data.finishExecution(claim.executionId, false, {}, message);
    return { status, succeeded: false, message: `Rollback failed: ${message}` };
  }
}

/** Dry run: shows what would change. Never modifies anything except the history entry. */
export async function simulateProposal(data: WorkspaceData, proposalId: string): Promise<Preview> {
  const ctx = await context(data, proposalId, null);
  const preview = await executorFor(ctx.asset).preview(ctx);
  await data.recordSimulation(proposalId, { ...preview });
  return preview;
}

export async function previewProposal(data: WorkspaceData, proposalId: string): Promise<Preview> {
  const ctx = await context(data, proposalId, null);
  return executorFor(ctx.asset).preview(ctx);
}

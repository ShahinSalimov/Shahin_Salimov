import "server-only";
import { makeFact } from "@/domain/extraction/fact";
import { attributeKey, entityKey } from "@/domain/graph/keys";
import type { Asset, Change, ExecutionMode, UpdateProposal } from "@/domain/workspace/model";
import type { WorkspaceData } from "../data/source";

/** A problem whose message is safe to show to the user. */
export class ExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionError";
  }
}

export interface ExecutionContext {
  data: WorkspaceData;
  proposal: UpdateProposal;
  asset: Asset;
  change: Change;
  /** Free-text confirmation or note from the person executing. */
  note: string | null;
}

export interface Preview {
  mode: ExecutionMode;
  target: string;
  before: string;
  after: string;
  steps: string[];
  externalEffect: boolean;
}

/**
 * Applies an approved update. Every executor receives the proposal's
 * idempotency key; executors that talk to external systems must send it so a
 * retried call is applied at most once.
 */
export interface UpdateExecutor {
  readonly mode: Exclude<ExecutionMode, "simulation">;
  readonly label: string;
  readonly rollbackLabel: string | null;
  preview(ctx: ExecutionContext): Promise<Preview>;
  execute(ctx: ExecutionContext, idempotencyKey: string): Promise<Record<string, unknown>>;
  rollback?(ctx: ExecutionContext, previous: Record<string, unknown>): Promise<Record<string, unknown>>;
}

function subject(change: Change): string {
  return [change.entityName, change.attributeName].filter(Boolean).join(" ") || "the information";
}

/** CHANGEMESH's own manual records: the update is really applied, and can be undone. */
export class InternalRecordExecutor implements UpdateExecutor {
  readonly mode = "internal" as const;
  readonly label = "Apply to the CHANGEMESH record";
  readonly rollbackLabel = "Undo";

  private async matching(ctx: ExecutionContext) {
    const { change } = ctx;
    if (!change.entityName || !change.attributeName) throw new ExecutionError("The change has no entity and attribute, so the record cannot be updated automatically.");
    const ek = entityKey(change.entityName);
    const ak = attributeKey(change.attributeName);
    return (await ctx.data.assetIntelligence(ctx.asset.id)).facts.filter((f) => f.method === "manual" && entityKey(f.entityName) === ek && attributeKey(f.attributeName) === ak);
  }

  async preview(ctx: ExecutionContext): Promise<Preview> {
    const current = await this.matching(ctx);
    const remove = ctx.change.type === "deleted" || ctx.proposal.proposedValue === "(remove)";
    return {
      mode: "internal",
      target: ctx.asset.name,
      before: current.map((f) => f.valueText).join(" / ") || "(not recorded)",
      after: remove ? "(removed)" : (ctx.proposal.proposedValue ?? "—"),
      steps: [
        current.length ? `Replace ${current.length} manual fact(s) for ${subject(ctx.change)}.` : `Add ${subject(ctx.change)} to the record.`,
        "Keep the previous value so the update can be undone.",
      ],
      externalEffect: false,
    };
  }

  async execute(ctx: ExecutionContext, idempotencyKey: string) {
    const { change, proposal } = ctx;
    const remove = change.type === "deleted" || proposal.proposedValue === "(remove)";
    if (!remove && !proposal.proposedValue) throw new ExecutionError("The proposal has no value to apply.");
    const current = await this.matching(ctx);
    // Idempotent: if the record already holds exactly the proposed value, nothing is written twice.
    if (!remove && current.length === 1 && current[0]!.valueText === proposal.proposedValue) {
      return { applied: true, alreadyApplied: true, idempotencyKey, removed: [], addedFactId: null };
    }
    for (const f of current) await ctx.data.deleteFact(f.id);
    let addedFactId: string | null = null;
    if (!remove) {
      const fact = makeFact(change.entityName!, change.attributeName!, proposal.proposedValue!, { kind: "manual" }, 1, "manual");
      if (!fact) throw new ExecutionError("The proposed value is empty after removing unsupported characters.");
      addedFactId = (await ctx.data.addManualFact(ctx.asset.id, fact)).id;
    }
    return {
      applied: true,
      idempotencyKey,
      removed: current.map((f) => ({ entityName: f.entityName, attributeName: f.attributeName, valueText: f.valueText })),
      addedFactId,
      summary: remove ? `Removed ${subject(change)} from ${ctx.asset.name}.` : `${ctx.asset.name}: ${subject(change)} = ${proposal.proposedValue}.`,
    };
  }

  async rollback(ctx: ExecutionContext, previous: Record<string, unknown>) {
    if (previous.alreadyApplied) return { rolledBack: true, summary: "Nothing to undo: the record already held this value before." };
    const added = typeof previous.addedFactId === "string" ? previous.addedFactId : null;
    const removed = Array.isArray(previous.removed) ? (previous.removed as { entityName: string; attributeName: string; valueText: string }[]) : [];
    if (added) await ctx.data.deleteFact(added).catch(() => undefined); // already gone is fine
    for (const r of removed) {
      const fact = makeFact(r.entityName, r.attributeName, r.valueText, { kind: "manual" }, 1, "manual");
      if (fact) await ctx.data.addManualFact(ctx.asset.id, fact);
    }
    return { rolledBack: true, restored: removed.map((r) => r.valueText), summary: removed.length ? `Restored ${removed.map((r) => r.valueText).join(", ")}.` : "Removed the added value." };
  }
}

/**
 * Websites, documents, spreadsheets and catalogs live outside CHANGEMESH and no
 * connector is available yet: a person applies the update and confirms it here.
 * Nothing is published by CHANGEMESH.
 */
export class ManualConfirmationExecutor implements UpdateExecutor {
  readonly mode = "manual" as const;
  readonly label = "Mark as applied";
  readonly rollbackLabel = "Reopen";

  async preview(ctx: ExecutionContext): Promise<Preview> {
    const where = ctx.asset.sourceUrl ? ` at ${ctx.asset.sourceUrl}` : "";
    return {
      mode: "manual",
      target: ctx.asset.name,
      before: ctx.proposal.currentValue ?? "—",
      after: ctx.proposal.proposedValue ?? "—",
      steps: [
        `Open ${ctx.asset.name}${where}.`,
        ctx.proposal.reason ?? `Change ${subject(ctx.change)} to ${ctx.proposal.proposedValue}.`,
        "Confirm here when done. CHANGEMESH does not change external systems.",
        "Rescan or re-upload the asset afterwards to verify the new value.",
      ],
      externalEffect: false,
    };
  }

  async execute(ctx: ExecutionContext, idempotencyKey: string) {
    const note = ctx.note?.trim();
    if (!note) throw new ExecutionError("Describe how the update was applied (for example “Updated the menu page in the CMS”).");
    return { applied: true, confirmedManually: true, note: note.slice(0, 500), idempotencyKey, verify: "Rescan or re-upload the asset to verify the new value." };
  }

  async rollback() {
    return { reopened: true, summary: "Marked as not applied. Undo the change in the external system yourself if it was made." };
  }
}

/**
 * Contract for future connectors (WordPress, Shopify, Google Business Profile…).
 * Implementations must: send `idempotencyKey` (e.g. as an Idempotency-Key header),
 * read back the value after writing, and return what is needed to roll back.
 * No connector is implemented yet, so no asset uses this executor.
 */
export interface IntegrationConnector {
  provider: string;
  supports(asset: Asset): boolean;
  apply(asset: Asset, field: { entity: string; attribute: string }, value: string | null, idempotencyKey: string): Promise<{ externalId: string; previousValue: string | null }>;
  revert?(asset: Asset, externalId: string, previousValue: string | null, idempotencyKey: string): Promise<void>;
}
export const INTEGRATION_CONNECTORS: IntegrationConnector[] = [];

export function executorFor(asset: Asset): UpdateExecutor {
  if (asset.type === "manual") return new InternalRecordExecutor();
  return new ManualConfirmationExecutor();
}

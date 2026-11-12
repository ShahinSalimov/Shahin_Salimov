import { formatLocation } from "../extraction/location";
import type { Asset, ChangeType, ImpactLevel } from "../workspace/model";
import type { ImpactDraft } from "./impact";

export interface ProposalDraft {
  targetAssetId: string;
  currentValue: string | null;
  proposedValue: string | null;
  reason: string;
  evidence: { label: string; detail?: string }[];
  impactLevel: ImpactLevel;
}

/**
 * Turns impacts into update proposals. Only assets that hold the changed fact get
 * a proposal (a concrete value to change); connected-only assets keep a "check"
 * recommendation in the report. Proposals are always created as pending — no
 * analysis, rule-based or AI, can approve or execute them.
 */
export function buildProposals(impacts: ImpactDraft[], assets: Asset[], change: { type: ChangeType }, analysisLabel: string): ProposalDraft[] {
  const names = new Map(assets.map((a) => [a.id, a.name]));
  return impacts
    .filter((i) => i.containsFact)
    .map((i) => ({
      targetAssetId: i.assetId,
      currentValue: i.currentValue ?? i.oldValue,
      proposedValue: change.type === "deleted" ? "(remove)" : i.newValue,
      reason: i.recommendedAction,
      evidence: [
        { label: "Path", detail: i.path.map((s) => names.get(s.assetId) ?? "?").join(" → ") },
        ...(i.location ? [{ label: "Found at", detail: formatLocation(i.location) }] : []),
        { label: "Confidence", detail: `${Math.round(i.confidence * 100)}%` },
        { label: "Analysis", detail: analysisLabel },
      ],
      impactLevel: i.level,
    }));
}

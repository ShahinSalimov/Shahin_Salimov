import "server-only";
import { changeTitle, diffFacts } from "@/domain/changes/detect";
import { analyzeImpact, summarizeReport, type ImpactDraft } from "@/domain/changes/impact";
import { findInconsistencies } from "@/domain/changes/inconsistency";
import { buildProposals } from "@/domain/changes/proposals";
import { formatLocation } from "@/domain/extraction/location";
import { attributeKey, entityKey } from "@/domain/graph/keys";
import { isOpenChange } from "@/domain/insights/metrics";
import type { Change, ChangeAnalysis } from "@/domain/workspace/model";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getAnalyzer } from "../ai";
import { RuleBasedAnalyzer } from "../ai/rules";
import { AiError, type AnalysisRequest, type AnalysisResult } from "../ai/types";
import type { Viewer } from "../auth/session";
import type { WorkspaceData } from "../data/source";

export interface AnalysisOutcome {
  generatedBy: ChangeAnalysis["generatedBy"];
  summary: string;
  impacts: number;
  proposalsCreated: number;
  aiError: string | null;
}

const MAX_AUTO_CHANGES = 10;

/**
 * Runs the deterministic impact engine for one change, optionally lets Claude
 * improve the wording (never the set of affected assets), and stores impacts,
 * pending proposals and analysis metadata atomically. AI failures fall back to
 * the rule-based result and are reported, never hidden.
 */
export async function runImpactAnalysis(data: WorkspaceData, viewer: Viewer, changeId: string, opts: { useAi: boolean }): Promise<AnalysisOutcome> {
  const [snapshot, facts] = await Promise.all([data.snapshot(), data.workspaceFacts()]);
  const change = snapshot.changes.find((c) => c.id === changeId);
  if (!change) throw new AppError("NOT_FOUND", "Change not found.");
  if (!isOpenChange(change)) throw new AppError("VALIDATION_FAILED", "Closed changes are not analyzed again.");

  const assets = new Map(snapshot.assets.map((a) => [a.id, a]));
  const report = analyzeImpact({
    change: { type: change.type, entityName: change.entityName, attributeName: change.attributeName, oldValue: change.oldValue, newValue: change.newValue, sourceAssetId: change.sourceAssetId },
    assets: snapshot.assets,
    relationships: snapshot.relationships,
    facts,
  });
  const ruleSummary = summarizeReport(change.title, report);
  const request: AnalysisRequest = {
    change: { title: change.title, type: change.type, entityName: change.entityName, attributeName: change.attributeName, oldValue: change.oldValue, newValue: change.newValue, sourceAssetName: change.sourceAssetId ? (assets.get(change.sourceAssetId)?.name ?? null) : null },
    impacts: report.impacts.map((i) => ({
      assetId: i.assetId,
      assetName: assets.get(i.assetId)?.name ?? "",
      assetType: assets.get(i.assetId)?.type ?? "",
      level: i.level,
      depth: i.depth,
      path: i.path.map((s) => assets.get(s.assetId)?.name ?? "?").join(" → "),
      currentValue: i.currentValue,
      containsFact: i.containsFact,
      location: i.location ? formatLocation(i.location) : null,
      recommendedAction: i.recommendedAction,
      reasons: i.reasons,
    })),
    relatedFacts: report.relatedFacts,
    ruleSummary,
  };

  const analyzer = getAnalyzer(viewer, opts.useAi && report.impacts.length > 0);
  let result: AnalysisResult;
  let aiError: string | null = null;
  try {
    result = await analyzer.analyze(request);
  } catch (error) {
    if (!(error instanceof AiError)) throw error;
    aiError = error.message;
    logger.warn("ai.analysis_failed", { changeId, kind: error.kind });
    if (error.usage) {
      await data.recordAiUsage({ changeId, model: error.usage.model, status: error.kind === "invalid_output" ? "rejected_output" : "failed", inputTokens: error.usage.inputTokens, outputTokens: error.usage.outputTokens, costUsd: null, attempts: error.usage.attempts, durationMs: null, error: error.message });
    }
    result = await new RuleBasedAnalyzer().analyze(request);
    result.warnings.push(`AI analysis failed: ${error.message} The rule-based analysis is shown instead.`);
  }

  if (result.provider === "claude" && result.usage) {
    await data.recordAiUsage({ changeId, model: result.model ?? "unknown", status: "succeeded", inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costUsd: result.usage.costUsd, attempts: result.usage.attempts, durationMs: result.usage.durationMs, error: null });
  }

  const byAsset = new Map(result.impacts.map((i) => [i.assetId, i]));
  const merged: ImpactDraft[] = report.impacts.map((i) => {
    const ai = byAsset.get(i.assetId);
    return ai ? { ...i, level: ai.level, recommendedAction: ai.recommendedAction } : i;
  });
  const origin = result.provider === "claude" ? ("ai" as const) : ("rule" as const);
  const label = result.provider === "claude" ? `AI-assisted (${result.model})` : "Rule-based (no AI)";
  const proposals = buildProposals(merged, snapshot.assets, change, label).map((p) => ({ ...p, origin }));

  const counts = { ...report.counts, critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of merged) counts[i.level]++;
  const analysis: ChangeAnalysis = {
    generatedBy: result.provider === "claude" ? "ai" : "rules",
    model: result.model,
    summary: result.summary,
    warnings: result.warnings,
    counts,
    relatedFacts: report.relatedFacts,
    usage: result.usage ? { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costUsd: result.usage.costUsd } : null,
    notes: Object.fromEntries(
      merged.map((i) => [i.assetId, { reasons: i.reasons, rationale: byAsset.get(i.assetId)?.rationale ?? null, currentValue: i.currentValue, containsFact: i.containsFact, inconsistent: i.inconsistent }]),
    ),
    skipped: report.skipped,
  };

  const saved = await data.saveChangeAnalysis(change.id, { impacts: merged.map((i) => ({ ...i, origin })), proposals, analysis });
  logger.info("change.analyzed", { changeId, impacts: merged.length, proposals: saved.proposalsCreated, provider: result.provider });
  return { generatedBy: analysis.generatedBy, summary: analysis.summary, impacts: merged.length, proposalsCreated: saved.proposalsCreated, aiError };
}

/** After a new version of an asset: compare with the previous version and record each changed fact. */
export async function detectChangesFromVersion(data: WorkspaceData, viewer: Viewer, assetId: string, version: number): Promise<number> {
  if (version < 2) return 0;
  const [before, after] = await Promise.all([data.versionFacts(assetId, version - 1), data.versionFacts(assetId, version)]);
  const detected = diffFacts(before, after).slice(0, MAX_AUTO_CHANGES);
  for (const d of detected) {
    const { id } = await data.createChange(
      { title: changeTitle(d), type: d.type, entityName: d.entityName, attributeName: d.attributeName, oldValue: d.oldValue, newValue: d.newValue, description: `Detected automatically by comparing version v${version - 1} with v${version}.`, sourceAssetId: assetId },
      { origin: "scan" },
    );
    await runImpactAnalysis(data, viewer, id, { useAi: false });
  }
  return detected.length;
}

/** Records conflicting / outdated information across assets as changes (once per open issue). */
export async function detectInconsistencies(data: WorkspaceData, viewer: Viewer): Promise<{ created: number; existing: number }> {
  const [snapshot, facts] = await Promise.all([data.snapshot(), data.workspaceFacts()]);
  const openKeys = new Set(
    snapshot.changes.filter(isOpenChange).filter((c) => c.entityName && c.attributeName).map((c) => `${c.type}|${entityKey(c.entityName!)}|${attributeKey(c.attributeName!)}`),
  );
  let created = 0;
  let existing = 0;
  for (const inc of findInconsistencies(snapshot.assets, facts).slice(0, 20)) {
    if (openKeys.has(`${inc.type}|${inc.key}`)) {
      existing++;
      continue;
    }
    const title = inc.type === "outdated" ? `${inc.entityName} ${inc.attributeName} is outdated in ${inc.assetIds.length} asset${inc.assetIds.length === 1 ? "" : "s"}` : `${inc.entityName} ${inc.attributeName} differs between assets`;
    const { id } = await data.createChange(
      { title: title.slice(0, 200), type: inc.type, entityName: inc.entityName, attributeName: inc.attributeName, oldValue: inc.oldValue, newValue: inc.newValue, description: inc.description.slice(0, 4000), sourceAssetId: inc.sourceAssetId },
      { origin: "rule" },
    );
    await runImpactAnalysis(data, viewer, id, { useAi: false });
    created++;
  }
  return { created, existing };
}

export function changeLabel(change: Change): string {
  return change.analysis?.generatedBy === "ai" ? `AI-assisted (${change.analysis.model})` : change.analysis?.generatedBy === "demo" ? "Sample analysis" : "Rule-based";
}

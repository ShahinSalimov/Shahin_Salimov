import { cleanInline } from "@/domain/extraction/sanitize";
import { IMPACT_LEVELS, type ImpactLevel } from "@/domain/workspace/model";
import type { AnalysisRequest, AnalyzedImpact } from "./types";

/**
 * Guardrails for AI output. The deterministic engine decides WHICH assets are
 * affected; the model may only improve wording and nudge a level by one step.
 * - unknown or duplicate asset ids are dropped
 * - level changes larger than one step are refused (rule level kept)
 * - text is sanitized and length-capped
 * - assets the model left out keep the rule-based result
 */
export function mergeAiImpacts(request: AnalysisRequest, aiImpacts: { assetId: string; level: string; recommendedAction: string; rationale: string }[]): { impacts: AnalyzedImpact[]; warnings: string[] } {
  const warnings: string[] = [];
  const byId = new Map<string, (typeof aiImpacts)[number]>();
  let unknown = 0;
  for (const i of aiImpacts) {
    if (!request.impacts.some((r) => r.assetId === i.assetId)) unknown++;
    else if (!byId.has(i.assetId)) byId.set(i.assetId, i);
  }
  if (unknown) warnings.push(`The AI referred to ${unknown} asset(s) that are not part of the analysis; they were ignored.`);

  let clamped = 0;
  let missing = 0;
  const impacts = request.impacts.map((r) => {
    const ai = byId.get(r.assetId);
    if (!ai) {
      missing++;
      return { assetId: r.assetId, level: r.level, recommendedAction: r.recommendedAction, rationale: null };
    }
    let level: ImpactLevel = r.level;
    if ((IMPACT_LEVELS as readonly string[]).includes(ai.level)) {
      const delta = IMPACT_LEVELS.indexOf(ai.level as ImpactLevel) - IMPACT_LEVELS.indexOf(r.level);
      if (Math.abs(delta) <= 1) level = ai.level as ImpactLevel;
      else clamped++;
    }
    const action = cleanInline(ai.recommendedAction, 500);
    return { assetId: r.assetId, level, recommendedAction: action || r.recommendedAction, rationale: cleanInline(ai.rationale, 500) || null };
  });
  if (clamped) warnings.push(`${clamped} AI level change(s) larger than one step were not applied.`);
  if (missing) warnings.push(`The AI did not comment on ${missing} asset(s); rule-based recommendations are shown for them.`);
  return { impacts, warnings };
}

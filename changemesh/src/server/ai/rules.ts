import type { AnalysisRequest, AnalysisResult, ChangeAnalyzer } from "./types";

/** Deterministic analyzer used without an API key and in demo mode. Never presented as AI. */
export class RuleBasedAnalyzer implements ChangeAnalyzer {
  readonly provider = "rules" as const;

  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    return {
      provider: "rules",
      model: null,
      summary: request.ruleSummary,
      impacts: request.impacts.map((i) => ({ assetId: i.assetId, level: i.level, recommendedAction: i.recommendedAction, rationale: null })),
      warnings: [],
      usage: null,
    };
  }
}

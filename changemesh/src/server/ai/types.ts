import type { ImpactLevel } from "@/domain/workspace/model";

/** What an analyzer may see: the change and the impacts computed by the deterministic engine. */
export interface AnalysisRequest {
  change: { title: string; type: string; entityName: string | null; attributeName: string | null; oldValue: string | null; newValue: string | null; sourceAssetName: string | null };
  impacts: {
    assetId: string;
    assetName: string;
    assetType: string;
    level: ImpactLevel;
    depth: number;
    path: string;
    currentValue: string | null;
    containsFact: boolean;
    location: string | null;
    recommendedAction: string;
    reasons: string[];
  }[];
  relatedFacts: string[];
  ruleSummary: string;
}

export interface AnalyzedImpact {
  assetId: string;
  level: ImpactLevel;
  recommendedAction: string;
  rationale: string | null;
}

export interface AnalysisResult {
  provider: "rules" | "claude";
  model: string | null;
  summary: string;
  impacts: AnalyzedImpact[];
  warnings: string[];
  usage: { inputTokens: number; outputTokens: number; costUsd: number | null; attempts: number; durationMs: number } | null;
}

export interface ChangeAnalyzer {
  readonly provider: "rules" | "claude";
  analyze(request: AnalysisRequest): Promise<AnalysisResult>;
}

/** An AI problem with a message that is safe to show. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "refused" | "invalid_output" | "rate_limited" | "unavailable" | "failed",
    readonly usage?: { inputTokens: number; outputTokens: number; model: string; attempts: number },
  ) {
    super(message);
    this.name = "AiError";
  }
}

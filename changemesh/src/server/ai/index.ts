import "server-only";
import type { Viewer } from "../auth/session";
import { getServerEnv } from "../env.server";
import { ClaudeAnalyzer, DEFAULT_MODEL } from "./claude";
import { RuleBasedAnalyzer } from "./rules";
import type { ChangeAnalyzer } from "./types";

export interface AiStatus {
  available: boolean;
  model: string | null;
  reason: string | null;
}

/** Whether AI analysis can run for this viewer. Demo sessions never use AI (no cost for anonymous visitors). */
export function aiStatus(viewer: Viewer): AiStatus {
  const env = getServerEnv();
  if (viewer.kind === "demo") return { available: false, model: null, reason: "Demo mode uses rule-based analysis only." };
  if (env.CHANGEMESH_AI_PROVIDER !== "claude") return { available: false, model: null, reason: "AI analysis is not enabled for this deployment (CHANGEMESH_AI_PROVIDER)." };
  if (!env.ANTHROPIC_API_KEY) return { available: false, model: null, reason: "AI analysis is enabled but ANTHROPIC_API_KEY is missing." };
  return { available: true, model: env.CHANGEMESH_AI_MODEL ?? DEFAULT_MODEL, reason: null };
}

export function getAnalyzer(viewer: Viewer, wantAi: boolean): ChangeAnalyzer {
  const status = aiStatus(viewer);
  return wantAi && status.available ? new ClaudeAnalyzer(status.model!) : new RuleBasedAnalyzer();
}

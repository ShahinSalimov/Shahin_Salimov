import "server-only";
import { suggestRelationships } from "@/domain/graph/suggest";
import { logger } from "@/lib/logger";
import type { WorkspaceData } from "./data/source";

/** Recomputes rule-based relationship suggestions from current facts and stores new ones. */
export async function refreshSuggestions(data: WorkspaceData): Promise<number> {
  const [snapshot, facts] = await Promise.all([data.snapshot(), data.workspaceFacts()]);
  const suggestions = suggestRelationships(snapshot.assets, facts, snapshot.relationships);
  const created = suggestions.length ? await data.addSuggestions(suggestions) : 0;
  logger.info("graph.suggestions_refreshed", { candidates: suggestions.length, created });
  return created;
}

/** Same, but never fails the caller (used after scans). */
export async function refreshSuggestionsSafely(data: WorkspaceData): Promise<number> {
  try {
    return await refreshSuggestions(data);
  } catch (error) {
    logger.error("graph.suggestions_failed", { error });
    return 0;
  }
}

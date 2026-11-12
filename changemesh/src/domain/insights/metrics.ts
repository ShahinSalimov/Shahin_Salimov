import type { Asset, Change, ChangeImpact, ImpactLevel, WorkspaceSnapshot } from "../workspace/model";
import { IMPACT_LEVELS } from "../workspace/model";

const CLOSED_CHANGE = new Set<Change["status"]>(["completed", "cancelled", "rejected"]);

export function isOpenChange(change: Change): boolean {
  return !CLOSED_CHANGE.has(change.status);
}

export type AssetHealth = "healthy" | "outdated" | "scan_issue" | "unscanned";

/**
 * Health of one asset, worst state first:
 * - scan_issue: last scan failed or was partial
 * - outdated:   affected by an open change whose update for this asset is not completed
 * - unscanned:  never scanned or scan in progress (we do not claim it is healthy)
 * - healthy:    scanned successfully and not affected by open changes
 */
export function assetHealth(asset: Asset, snapshot: Pick<WorkspaceSnapshot, "changes" | "impacts" | "proposals">): AssetHealth {
  if (asset.scanStatus === "failed" || asset.scanStatus === "partial") return "scan_issue";
  if (outdatedAssetIds(snapshot).has(asset.id)) return "outdated";
  if (asset.scanStatus !== "succeeded" && asset.type !== "manual") return "unscanned";
  return "healthy";
}

/** Assets with an impact from an open change that has no completed update proposal yet. */
export function outdatedAssetIds(snapshot: Pick<WorkspaceSnapshot, "changes" | "impacts" | "proposals">): Set<string> {
  const open = new Set(snapshot.changes.filter(isOpenChange).map((c) => c.id));
  const done = new Set(
    snapshot.proposals.filter((p) => p.executionStatus === "completed").map((p) => `${p.changeId}:${p.targetAssetId}`),
  );
  const ids = new Set<string>();
  for (const impact of snapshot.impacts) {
    if (open.has(impact.changeId) && !done.has(`${impact.changeId}:${impact.assetId}`)) ids.add(impact.assetId);
  }
  return ids;
}

export function assetHealthSummary(snapshot: WorkspaceSnapshot): Record<AssetHealth, number> {
  const out: Record<AssetHealth, number> = { healthy: 0, outdated: 0, scan_issue: 0, unscanned: 0 };
  for (const asset of snapshot.assets) if (asset.status === "active") out[assetHealth(asset, snapshot)]++;
  return out;
}

/** Asset ids that take part in at least one confirmed relationship. */
export function connectedAssetIds(snapshot: Pick<WorkspaceSnapshot, "relationships">): Set<string> {
  const ids = new Set<string>();
  for (const r of snapshot.relationships) {
    if (r.status !== "confirmed") continue;
    ids.add(r.sourceAssetId);
    ids.add(r.targetAssetId);
  }
  return ids;
}

export interface DashboardMetrics {
  totalAssets: number;
  connectedAssets: number;
  detectedChanges: number;
  changesLast30Days: number;
  pendingApprovals: number;
  needsRevision: number;
  potentialConflicts: number;
  suggestedRelationships: number;
}

export function dashboardMetrics(snapshot: WorkspaceSnapshot, now: Date = new Date()): DashboardMetrics {
  const active = snapshot.assets.filter((a) => a.status === "active");
  const connected = connectedAssetIds(snapshot);
  const open = snapshot.changes.filter(isOpenChange);
  const since = now.getTime() - 30 * 24 * 3600 * 1000;
  return {
    totalAssets: active.length,
    connectedAssets: active.filter((a) => connected.has(a.id)).length,
    detectedChanges: open.length,
    changesLast30Days: snapshot.changes.filter((c) => Date.parse(c.createdAt) >= since).length,
    pendingApprovals: snapshot.proposals.filter((p) => p.approvalStatus === "pending").length,
    needsRevision: snapshot.proposals.filter((p) => p.approvalStatus === "needs_revision").length,
    potentialConflicts: open.filter((c) => c.type === "conflicting" || c.type === "outdated").length,
    suggestedRelationships: snapshot.relationships.filter((r) => r.status === "suggested").length,
  };
}

export function emptyLevelCounts(): Record<ImpactLevel, number> {
  return { critical: 0, high: 0, medium: 0, low: 0 };
}

export function countByLevel(impacts: ChangeImpact[]): Record<ImpactLevel, number> {
  const out = emptyLevelCounts();
  for (const i of impacts) out[i.level]++;
  return out;
}

export interface ChangeImpactSummary {
  change: Change;
  levels: Record<ImpactLevel, number>;
  affectedAssets: number;
  highestLevel: ImpactLevel | null;
}

/** Impact of every open change, most severe first. */
export function impactOverview(snapshot: WorkspaceSnapshot): { totals: Record<ImpactLevel, number>; changes: ChangeImpactSummary[] } {
  const open = snapshot.changes.filter(isOpenChange);
  const openIds = new Set(open.map((c) => c.id));
  const totals = countByLevel(snapshot.impacts.filter((i) => openIds.has(i.changeId)));
  const changes = open
    .map((change) => {
      const impacts = snapshot.impacts.filter((i) => i.changeId === change.id);
      const levels = countByLevel(impacts);
      return {
        change,
        levels,
        affectedAssets: new Set(impacts.map((i) => i.assetId)).size,
        highestLevel: IMPACT_LEVELS.find((l) => levels[l] > 0) ?? null,
      };
    })
    .sort((a, b) => severityScore(b.levels) - severityScore(a.levels) || Date.parse(b.change.createdAt) - Date.parse(a.change.createdAt));
  return { totals, changes };
}

function severityScore(levels: Record<ImpactLevel, number>): number {
  return levels.critical * 1000 + levels.high * 100 + levels.medium * 10 + levels.low;
}

/** Number of changes created in each of the last `weeks` weeks (oldest first). */
export function weeklyChangeTrend(changes: Change[], now: Date = new Date(), weeks = 8): { weekStart: string; count: number }[] {
  const week = 7 * 24 * 3600 * 1000;
  const end = now.getTime();
  return Array.from({ length: weeks }, (_, idx) => {
    const start = end - (weeks - idx) * week;
    const stop = start + week;
    return {
      weekStart: new Date(start).toISOString(),
      count: changes.filter((c) => {
        const t = Date.parse(c.createdAt);
        return t >= start && t < stop;
      }).length,
    };
  });
}

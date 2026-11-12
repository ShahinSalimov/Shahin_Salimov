import type { Asset, AssetRelationship } from "../workspace/model";

export interface GraphStats {
  confirmed: number;
  suggested: number;
  rejected: number;
  connectedAssetIds: Set<string>;
  disconnected: Asset[];
  /** Longest shortest path (in hops) between two connected assets — the graph diameter. */
  maxDepth: number;
  /** Connected groups of assets (size of each, largest first). */
  clusters: number[];
}

/** Statistics over confirmed relationships only; suggestions are not trusted structure yet. */
export function graphStats(assets: Asset[], relationships: AssetRelationship[]): GraphStats {
  const active = assets.filter((a) => a.status === "active");
  const ids = new Set(active.map((a) => a.id));
  const adj = new Map<string, Set<string>>();
  for (const id of ids) adj.set(id, new Set());
  for (const r of relationships) {
    if (r.status !== "confirmed" || !ids.has(r.sourceAssetId) || !ids.has(r.targetAssetId)) continue;
    adj.get(r.sourceAssetId)!.add(r.targetAssetId);
    adj.get(r.targetAssetId)!.add(r.sourceAssetId);
  }

  const bfs = (start: string): Map<string, number> => {
    const dist = new Map([[start, 0]]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i]!;
      for (const next of adj.get(node) ?? []) {
        if (!dist.has(next)) {
          dist.set(next, dist.get(node)! + 1);
          queue.push(next);
        }
      }
    }
    return dist;
  };

  let maxDepth = 0;
  const seen = new Set<string>();
  const clusters: number[] = [];
  for (const id of ids) {
    const dist = bfs(id);
    for (const d of dist.values()) maxDepth = Math.max(maxDepth, d);
    if (!seen.has(id) && (adj.get(id)?.size ?? 0) > 0) {
      for (const n of dist.keys()) seen.add(n);
      clusters.push(dist.size);
    }
  }

  const connected = new Set([...ids].filter((id) => (adj.get(id)?.size ?? 0) > 0));
  const visible = relationships.filter((r) => ids.has(r.sourceAssetId) && ids.has(r.targetAssetId));
  return {
    confirmed: visible.filter((r) => r.status === "confirmed").length,
    suggested: visible.filter((r) => r.status === "suggested").length,
    rejected: visible.filter((r) => r.status === "rejected").length,
    connectedAssetIds: connected,
    disconnected: active.filter((a) => !connected.has(a.id)),
    maxDepth,
    clusters: clusters.sort((a, b) => b - a),
  };
}

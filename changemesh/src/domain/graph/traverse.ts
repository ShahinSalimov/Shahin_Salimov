export interface Link {
  source: string;
  target: string;
}

/** Undirected BFS: distance (in hops) from `start` to every reachable node, up to `maxDepth`. */
export function neighborhood(start: string, links: Link[], maxDepth = Number.POSITIVE_INFINITY): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const { source, target } of links) {
    (adj.get(source) ?? adj.set(source, []).get(source)!).push(target);
    (adj.get(target) ?? adj.set(target, []).get(target)!).push(source);
  }
  const dist = new Map([[start, 0]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]!;
    const d = dist.get(node)!;
    if (d >= maxDepth) continue;
    for (const next of adj.get(node) ?? []) {
      if (!dist.has(next)) {
        dist.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}

/**
 * Dependency layer of each node for a left-to-right layout: nodes that depend
 * on nothing are layer 0; a node is one layer right of everything it depends
 * on (edges point from dependent `source` to upstream `target`). Cycles are cut.
 */
export function dependencyLayers(nodes: string[], links: Link[]): Map<string, number> {
  const upstream = new Map<string, string[]>();
  for (const n of nodes) upstream.set(n, []);
  for (const { source, target } of links) if (upstream.has(source) && upstream.has(target) && source !== target) upstream.get(source)!.push(target);
  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (n: string): number => {
    if (layer.has(n)) return layer.get(n)!;
    if (visiting.has(n)) return 0; // cycle: treat the back edge as absent
    visiting.add(n);
    const ups = upstream.get(n) ?? [];
    const l = ups.length ? 1 + Math.max(...ups.map(visit)) : 0;
    visiting.delete(n);
    layer.set(n, l);
    return l;
  };
  nodes.forEach(visit);
  return layer;
}

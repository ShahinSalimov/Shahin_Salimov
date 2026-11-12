import type { ChangeImpact, ImpactLevel } from "../workspace/model";

export interface ImpactGraphData {
  nodes: { id: string; label: string; level: "source" | ImpactLevel | "connector"; column: number; row: number }[];
  edges: { id: string; source: string; target: string; label: string }[];
}

const REL_LABEL: Record<string, string> = {
  derived_from: "derived from",
  embeds: "embeds",
  links_to: "links to",
  syncs_with: "syncs with",
  references: "references",
  duplicates: "duplicates",
  shares: "same information",
  contains: "",
};

/** Lays out impact paths: each step of a path is one column to the right. */
export function buildImpactGraph(impacts: ChangeImpact[], names: Map<string, string>, sourceAssetId: string | null): ImpactGraphData {
  const level = new Map(impacts.map((i) => [i.assetId, i.level]));
  const column = new Map<string, number>();
  const edges = new Map<string, ImpactGraphData["edges"][number]>();
  if (sourceAssetId) column.set(sourceAssetId, 0);
  for (const i of impacts) {
    i.path.forEach((step, idx) => {
      column.set(step.assetId, Math.min(column.get(step.assetId) ?? idx, idx));
      if (idx > 0) {
        const prev = i.path[idx - 1]!.assetId;
        const id = `${prev}->${step.assetId}`;
        if (!edges.has(id) && prev !== step.assetId) edges.set(id, { id, source: prev, target: step.assetId, label: REL_LABEL[step.relationship] ?? step.relationship });
      }
    });
  }
  const rows = new Map<number, number>();
  const ordered = [...column.entries()].sort((a, b) => a[1] - b[1] || (names.get(a[0]) ?? "").localeCompare(names.get(b[0]) ?? ""));
  const nodes = ordered.map(([id, col]) => {
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    return { id, label: names.get(id) ?? "Deleted asset", level: id === sourceAssetId ? ("source" as const) : (level.get(id) ?? ("connector" as const)), column: col, row };
  });
  const tallest = Math.max(1, ...rows.values());
  for (const n of nodes) n.row += (tallest - (rows.get(n.column) ?? 1)) / 2;
  return { nodes, edges: [...edges.values()] };
}

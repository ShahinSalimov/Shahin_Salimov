import { graphStats } from "../insights/graph-stats";
import type { AssetHealth } from "../insights/metrics";
import type { Asset, AssetRelationship, AssetType, ExtractedFact, RecordOrigin, RelationshipStatus, RelationshipType } from "../workspace/model";
import { attributeKey, entityKey, PAGE_LEVEL_ATTRIBUTES } from "./keys";
import { dependencyLayers } from "./traverse";

export type GraphNodeKind = "entity" | "information" | "asset";

export interface InformationValue {
  assetId: string;
  assetName: string;
  value: string;
  normalized: string;
  matchesMajority: boolean;
}

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  x: number;
  y: number;
  column: number;
  degree: number;
  // asset nodes
  assetId?: string;
  assetType?: AssetType;
  health?: AssetHealth;
  factsCount?: number;
  isCustomerFacing?: boolean;
  connected?: boolean;
  layer?: number;
  // information / entity nodes
  entity?: string;
  attribute?: string;
  values?: InformationValue[];
  consistent?: boolean;
  assetCount?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "relationship" | "occurrence" | "attribute";
  confidence: number;
  relationshipId?: string;
  type?: RelationshipType;
  status?: RelationshipStatus;
  origin?: RecordOrigin;
  note?: string | null;
  label?: string;
  mismatch?: boolean;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  columns: { index: number; x: number; title: string }[];
  stats: {
    assets: number;
    connectedAssets: number;
    disconnectedAssets: number;
    entities: number;
    informationNodes: number;
    inconsistentInformation: number;
    relationships: Record<RelationshipStatus, number>;
    maxDepth: number;
    truncatedInformation: number;
  };
}

export const GRAPH_LAYOUT = { columnWidth: 270, assetRow: 92, infoRow: 64, entityRow: 64, maxInformationNodes: 80 } as const;

const TYPE_ORDER: Record<AssetType, number> = { csv: 0, manual: 1, product_catalog: 2, pdf: 3, website: 4, marketing_content: 5 };

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.POSITIVE_INFINITY;
}

/**
 * Builds the dependency graph entirely from records:
 *   entity ──has──► information (entity · attribute) ──appears in──► asset ──relationship──► asset
 * Information nodes are only created for facts that appear in at least two
 * assets — that is where a change can leave something out of date.
 */
export function buildDependencyGraph(input: {
  assets: Asset[];
  relationships: AssetRelationship[];
  facts: ExtractedFact[];
  health?: Map<string, AssetHealth>;
  factCounts?: Record<string, number>;
}): DependencyGraph {
  const W = GRAPH_LAYOUT.columnWidth;
  const assets = input.assets.filter((a) => a.status === "active");
  const assetIds = new Set(assets.map((a) => a.id));
  const rels = input.relationships.filter((r) => assetIds.has(r.sourceAssetId) && assetIds.has(r.targetAssetId));
  const live = rels.filter((r) => r.status !== "rejected");

  // ---------- information nodes from shared facts ----------
  const groups = new Map<string, { entity: Map<string, number>; attribute: string; byAsset: Map<string, ExtractedFact> }>();
  for (const f of input.facts) {
    if (!assetIds.has(f.assetId)) continue;
    const attr = attributeKey(f.attributeName);
    if (PAGE_LEVEL_ATTRIBUTES.has(attr)) continue;
    const ek = entityKey(f.entityName);
    if (!ek) continue;
    const key = `${ek}|${attr}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { entity: new Map(), attribute: attr, byAsset: new Map() }));
    g.entity.set(f.entityName, (g.entity.get(f.entityName) ?? 0) + 1);
    const prev = g.byAsset.get(f.assetId);
    if (!prev || f.confidence > prev.confidence) g.byAsset.set(f.assetId, f);
  }
  const assetName = new Map(assets.map((a) => [a.id, a.name]));
  const shared = [...groups.entries()]
    .filter(([, g]) => g.byAsset.size >= 2)
    .map(([key, g]) => {
      const counts = new Map<string, number>();
      for (const f of g.byAsset.values()) counts.set(f.normalizedValue, (counts.get(f.normalizedValue) ?? 0) + 1);
      const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      const entity = [...g.entity.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      const values: InformationValue[] = [...g.byAsset.values()]
        .map((f) => ({ assetId: f.assetId, assetName: assetName.get(f.assetId) ?? "", value: f.valueText, normalized: f.normalizedValue, matchesMajority: f.normalizedValue === majority }))
        .sort((a, b) => a.assetName.localeCompare(b.assetName));
      return { key, entityKey: key.split("|")[0]!, entity, attribute: g.attribute, values, consistent: counts.size === 1 };
    })
    .sort((a, b) => Number(a.consistent) - Number(b.consistent) || b.values.length - a.values.length || a.entity.localeCompare(b.entity));
  const kept = shared.slice(0, GRAPH_LAYOUT.maxInformationNodes);

  // ---------- asset layout: dependency layers, left (sources) → right ----------
  const degree = new Map<string, number>();
  for (const r of live) {
    degree.set(r.sourceAssetId, (degree.get(r.sourceAssetId) ?? 0) + 1);
    degree.set(r.targetAssetId, (degree.get(r.targetAssetId) ?? 0) + 1);
  }
  const connected = assets.filter((a) => degree.get(a.id));
  const isolated = assets.filter((a) => !degree.get(a.id)).sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name));
  const layers = dependencyLayers(
    connected.map((a) => a.id),
    live.map((r) => ({ source: r.sourceAssetId, target: r.targetAssetId })),
  );
  const maxLayer = Math.max(0, ...layers.values());
  const byLayer: Asset[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const a of connected) byLayer[layers.get(a.id) ?? 0]!.push(a);
  for (const col of byLayer) col.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name));

  const yOf = new Map<string, number>();
  const place = (col: Asset[]) => col.forEach((a, i) => yOf.set(a.id, i * GRAPH_LAYOUT.assetRow));
  byLayer.forEach(place);
  const neighbors = (id: string) => live.flatMap((r) => (r.sourceAssetId === id ? [r.targetAssetId] : r.targetAssetId === id ? [r.sourceAssetId] : []));
  // Two barycenter sweeps reduce edge crossings.
  for (let pass = 0; pass < 2; pass++) {
    for (const col of byLayer) {
      col.sort((a, b) => mean(neighbors(a.id).map((n) => yOf.get(n) ?? 0)) - mean(neighbors(b.id).map((n) => yOf.get(n) ?? 0)) || a.name.localeCompare(b.name));
      place(col);
    }
  }

  const ASSET_COL0 = 2;
  const nodes: GraphNode[] = [];
  const healthOf = input.health ?? new Map();
  const assetNode = (a: Asset, column: number, y: number, isConnected: boolean): GraphNode => ({
    id: `asset:${a.id}`,
    kind: "asset",
    label: a.name,
    x: column * W,
    y,
    column,
    degree: degree.get(a.id) ?? 0,
    assetId: a.id,
    assetType: a.type,
    health: healthOf.get(a.id),
    factsCount: input.factCounts?.[a.id] ?? 0,
    isCustomerFacing: a.isCustomerFacing,
    connected: isConnected,
    layer: isConnected ? (layers.get(a.id) ?? 0) : undefined,
  });
  byLayer.forEach((col, l) => col.forEach((a) => nodes.push(assetNode(a, ASSET_COL0 + l, yOf.get(a.id)!, true))));
  const isolatedCol = ASSET_COL0 + (connected.length ? maxLayer + 1 : 0);
  isolated.forEach((a, i) => nodes.push(assetNode(a, isolatedCol, i * GRAPH_LAYOUT.assetRow, false)));

  // ---------- information + entity columns, ordered next to their assets ----------
  const assetY = new Map(nodes.map((n) => [n.assetId!, n.y]));
  const infoSorted = [...kept].sort((a, b) => mean(a.values.map((v) => assetY.get(v.assetId) ?? 0)) - mean(b.values.map((v) => assetY.get(v.assetId) ?? 0)));
  const infoY = new Map<string, number>();
  infoSorted.forEach((info, i) => {
    const y = i * GRAPH_LAYOUT.infoRow;
    infoY.set(info.key, y);
    nodes.push({
      id: `info:${info.key}`,
      kind: "information",
      label: `${info.entity} · ${info.attribute}`,
      x: 1 * W,
      y,
      column: 1,
      degree: info.values.length,
      entity: info.entity,
      attribute: info.attribute,
      values: info.values,
      consistent: info.consistent,
      assetCount: info.values.length,
    });
  });
  const entities = new Map<string, { label: string; infos: string[] }>();
  for (const info of infoSorted) {
    const e = entities.get(info.entityKey) ?? { label: info.entity, infos: [] };
    e.infos.push(info.key);
    entities.set(info.entityKey, e);
  }
  [...entities.entries()]
    .sort((a, b) => mean(a[1].infos.map((k) => infoY.get(k)!)) - mean(b[1].infos.map((k) => infoY.get(k)!)))
    .forEach(([key, e], i) =>
      nodes.push({ id: `entity:${key}`, kind: "entity", label: e.label, x: 0, y: i * GRAPH_LAYOUT.entityRow, column: 0, degree: e.infos.length, entity: e.label }),
    );

  // Center every column vertically around the tallest one.
  const heights = new Map<number, number>();
  for (const n of nodes) heights.set(n.column, Math.max(heights.get(n.column) ?? 0, n.y));
  const tallest = Math.max(0, ...heights.values());
  for (const n of nodes) n.y += (tallest - (heights.get(n.column) ?? 0)) / 2;

  // ---------- edges ----------
  const edges: GraphEdge[] = [];
  for (const r of rels) {
    edges.push({ id: `rel:${r.id}`, source: `asset:${r.sourceAssetId}`, target: `asset:${r.targetAssetId}`, kind: "relationship", relationshipId: r.id, type: r.type, status: r.status, confidence: r.confidence, origin: r.origin, note: r.note });
  }
  for (const info of infoSorted) {
    for (const v of info.values) {
      edges.push({ id: `occ:${info.key}:${v.assetId}`, source: `info:${info.key}`, target: `asset:${v.assetId}`, kind: "occurrence", confidence: 1, label: v.value, mismatch: !v.matchesMajority });
    }
  }
  for (const [key, e] of entities) for (const k of e.infos) edges.push({ id: `attr:${k}`, source: `entity:${key}`, target: `info:${k}`, kind: "attribute", confidence: 1 });

  const gs = graphStats(input.assets, input.relationships);
  const columns = [
    { index: 0, x: 0, title: "Entities" },
    { index: 1, x: W, title: "Shared information" },
    ...byLayer.map((_, l) => ({ index: ASSET_COL0 + l, x: (ASSET_COL0 + l) * W, title: connected.length ? (l === 0 ? "Sources" : `Depends on ${l === 1 ? "sources" : `level ${l - 1}`}`) : "" })).filter((c) => c.title),
    ...(isolated.length ? [{ index: isolatedCol, x: isolatedCol * W, title: "Not connected" }] : []),
  ];

  return {
    nodes,
    edges,
    columns,
    stats: {
      assets: assets.length,
      connectedAssets: connected.length,
      disconnectedAssets: isolated.length,
      entities: entities.size,
      informationNodes: kept.length,
      inconsistentInformation: kept.filter((k) => !k.consistent).length,
      relationships: {
        confirmed: rels.filter((r) => r.status === "confirmed").length,
        suggested: rels.filter((r) => r.status === "suggested").length,
        rejected: rels.filter((r) => r.status === "rejected").length,
      },
      maxDepth: gs.maxDepth,
      truncatedInformation: shared.length - kept.length,
    },
  };
}

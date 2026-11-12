import type { SourceLocation } from "../extraction/fact";
import { formatLocation } from "../extraction/location";
import { normalizeValue } from "../extraction/normalize";
import { attributeKey, entityKey } from "../graph/keys";
import type { Asset, AssetRelationship, AssetType, ChangeType, ExtractedFact, ImpactLevel, RelationshipPathStep, RelationshipType } from "../workspace/model";

export interface ImpactChange {
  type: ChangeType;
  entityName: string | null;
  attributeName: string | null;
  oldValue: string | null;
  newValue: string | null;
  sourceAssetId: string | null;
}

export interface ImpactDraft {
  assetId: string;
  level: ImpactLevel;
  depth: number;
  path: RelationshipPathStep[];
  oldValue: string | null;
  newValue: string | null;
  /** What the asset shows today (from its current facts), if known. */
  currentValue: string | null;
  /** The asset holds the changed fact itself (not only connected to the source). */
  containsFact: boolean;
  confidence: number;
  recommendedAction: string;
  reasons: string[];
  /** Shows a value that is neither the old nor the new one. */
  inconsistent: boolean;
  location: SourceLocation | null;
}

export interface ImpactReport {
  impacts: ImpactDraft[];
  skipped: { assetId: string; reason: string }[];
  counts: Record<ImpactLevel, number> & { direct: number; indirect: number; alreadyUpdated: number; inconsistencies: number };
  /** Other attributes known about the same entity ("Classic Burger · category"). */
  relatedFacts: string[];
}

export const IMPACT_LIMITS = { maxDepth: 4, maxImpacts: 200 } as const;

const SYMMETRIC: ReadonlySet<RelationshipType> = new Set(["syncs_with", "duplicates"]);
const TYPE_WEIGHT: Record<AssetType, number> = { website: 1.5, product_catalog: 1.5, pdf: 1.5, marketing_content: 1, csv: 0.5, manual: 0.5 };
const CRITICAL_ATTRIBUTES = new Set(["price", "availability", "opening hours", "phone", "address"]);
const LEVEL_ORDER: ImpactLevel[] = ["critical", "high", "medium", "low"];

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function scoreToLevel(score: number): ImpactLevel {
  return score >= 7 ? "critical" : score >= 5 ? "high" : score >= 3 ? "medium" : "low";
}

function norm(attribute: string, value: string | null): string | null {
  return value === null ? null : normalizeValue(attribute, value).normalized;
}

interface Hop {
  assetId: string;
  depth: number;
  path: RelationshipPathStep[];
  edgeConfidence: number;
  viaSuggested: boolean;
}

/** Breadth-first walk to every asset that depends (directly or indirectly) on `start`. */
function downstream(start: string, relationships: AssetRelationship[], active: Set<string>, maxDepth: number): Map<string, Hop> {
  const adj = new Map<string, { to: string; rel: AssetRelationship }[]>();
  const add = (from: string, to: string, rel: AssetRelationship) => (adj.get(from) ?? adj.set(from, []).get(from)!).push({ to, rel });
  for (const r of relationships) {
    if (r.status === "rejected" || !active.has(r.sourceAssetId) || !active.has(r.targetAssetId)) continue;
    add(r.targetAssetId, r.sourceAssetId, r); // the source of a relationship depends on its target
    if (SYMMETRIC.has(r.type)) add(r.sourceAssetId, r.targetAssetId, r);
  }
  const seen = new Map<string, Hop>([[start, { assetId: start, depth: 0, path: [{ assetId: start, relationship: "contains" }], edgeConfidence: 1, viaSuggested: false }]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = seen.get(queue[i]!)!;
    if (cur.depth >= maxDepth) continue;
    for (const { to, rel } of (adj.get(cur.assetId) ?? []).sort((a, b) => b.rel.confidence - a.rel.confidence)) {
      if (seen.has(to)) continue;
      const suggested = rel.status === "suggested";
      seen.set(to, {
        assetId: to,
        depth: cur.depth + 1,
        path: [...cur.path, { assetId: to, relationship: rel.type }],
        edgeConfidence: cur.edgeConfidence * rel.confidence * (suggested ? 0.7 : 1),
        viaSuggested: cur.viaSuggested || suggested,
      });
      queue.push(to);
    }
  }
  seen.delete(start);
  return seen;
}

function recommend(change: ImpactChange, asset: Asset, fact: ExtractedFact | undefined, containsFact: boolean, subject: string): string {
  const where = fact ? ` (${formatLocation(fact.location)})` : "";
  const newV = change.newValue ?? "the new value";
  if (!containsFact) {
    if (change.type === "created") return `Check whether “${asset.name}” should also list ${subject} (${newV}); it depends on the changed source.`;
    return `Check whether “${asset.name}” shows ${subject}. It is connected to the changed source but no matching fact was extracted from it.`;
  }
  const current = fact?.valueText ?? change.oldValue ?? "the old value";
  switch (change.type) {
    case "deleted":
      return `Remove ${subject}${where} — it is no longer offered.`;
    case "conflicting":
      return `Confirm which value is correct (${current} here vs ${newV} elsewhere), then correct the wrong source${where}.`;
    case "created":
      return `Add ${subject}: ${newV}${where}.`;
  }
  const verb: Record<AssetType, string> = {
    website: `Replace “${current}” with “${newV}” for ${subject} on this page${where}.`,
    pdf: `Regenerate the document with ${subject} = ${newV}${where}; replace printed or shared copies.`,
    csv: `Update ${subject} to ${newV} in the spreadsheet${where}.`,
    manual: `Update the record: ${subject} = ${newV}.`,
    product_catalog: `Update ${subject} to ${newV} in the catalog${where}.`,
    marketing_content: `Rewrite the copy that states ${subject} as “${current}”${where}; use ${newV}.`,
  };
  return verb[asset.type];
}

/**
 * Deterministic impact analysis. Finds every asset that holds the changed fact
 * (direct impact) and every asset that depends on the changed source through
 * relationships (indirect impact), then scores and explains each one.
 */
export function analyzeImpact(input: { change: ImpactChange; assets: Asset[]; relationships: AssetRelationship[]; facts: ExtractedFact[]; maxDepth?: number }): ImpactReport {
  const { change } = input;
  const maxDepth = input.maxDepth ?? IMPACT_LIMITS.maxDepth;
  const assets = new Map(input.assets.filter((a) => a.status === "active").map((a) => [a.id, a]));
  const active = new Set(assets.keys());
  const attr = change.attributeName ? attributeKey(change.attributeName) : null;
  const ek = change.entityName ? entityKey(change.entityName) : null;
  const subject = [change.entityName, attr].filter(Boolean).join(" ") || "this information";
  const oldN = attr ? norm(attr, change.oldValue) : null;
  const newN = attr ? norm(attr, change.newValue) : null;

  // Assets that hold the same fact (entity + attribute), best fact per asset.
  const holders = new Map<string, ExtractedFact>();
  const mentions = new Set<string>();
  const related = new Set<string>();
  for (const f of input.facts) {
    if (!active.has(f.assetId) || !ek) continue;
    if (entityKey(f.entityName) !== ek) continue;
    mentions.add(f.assetId);
    const fa = attributeKey(f.attributeName);
    if (attr && fa === attr) {
      const prev = holders.get(f.assetId);
      if (!prev || f.confidence > prev.confidence) holders.set(f.assetId, f);
    } else related.add(`${f.entityName} · ${fa}`);
  }

  const source = change.sourceAssetId && active.has(change.sourceAssetId) ? change.sourceAssetId : null;
  const reached = source ? downstream(source, input.relationships, active, maxDepth) : new Map<string, Hop>();
  const candidates = new Set<string>([...holders.keys(), ...reached.keys()]);
  if (source) candidates.delete(source);

  const impacts: ImpactDraft[] = [];
  const skipped: ImpactReport["skipped"] = [];
  let alreadyUpdated = 0;

  for (const id of [...candidates].sort()) {
    const asset = assets.get(id)!;
    const fact = holders.get(id);
    const hop = reached.get(id);
    const containsFact = Boolean(fact);
    const reasons: string[] = [];

    if (!containsFact) {
      // Connected but without the fact: keep only close or entity-mentioning dependents.
      if (!hop || (hop.depth > 2 && !mentions.has(id))) continue;
    }
    const current = fact?.valueText ?? null;
    const currentN = fact?.normalizedValue ?? null;

    if (containsFact && change.type !== "deleted" && newN !== null && currentN === newN) {
      alreadyUpdated++;
      skipped.push({ assetId: id, reason: `Already shows ${change.newValue}.` });
      continue;
    }

    const path: RelationshipPathStep[] = hop
      ? hop.path
      : source
        ? [{ assetId: source, relationship: "contains" }, { assetId: id, relationship: "shares" }]
        : [{ assetId: id, relationship: "shares" }];
    const depth = hop ? hop.depth : 1;

    const inconsistent = containsFact && oldN !== null && currentN !== oldN && currentN !== newN;
    if (containsFact) reasons.push(`Holds ${subject}${current ? ` = ${current}` : ""}${fact ? ` (${formatLocation(fact.location)})` : ""}.`);
    if (hop) reasons.push(hop.depth === 1 ? "Depends directly on the changed source." : `Depends on the changed source through ${hop.depth} relationships.`);
    if (hop?.viaSuggested) reasons.push("The path includes a suggested (unconfirmed) relationship.");
    if (inconsistent) reasons.push(`Currently shows ${current}, which is neither the old (${change.oldValue}) nor the new value.`);
    if (asset.scanStatus === "failed" || asset.scanStatus === "partial") reasons.push("The last scan was incomplete, so the current value is not fully verified.");
    if (asset.isCustomerFacing) reasons.push("Customers see this asset.");

    let score = TYPE_WEIGHT[asset.type] + (asset.isCustomerFacing ? 2 : 0) + (containsFact ? 2 : 0) + (containsFact && attr && CRITICAL_ATTRIBUTES.has(attr) ? 1 : 0) - Math.max(0, depth - 1);
    if (containsFact && change.type !== "created" && currentN !== newN) score += 1;
    let level = scoreToLevel(score);
    if (!containsFact && LEVEL_ORDER.indexOf(level) < LEVEL_ORDER.indexOf("medium")) level = "medium"; // unverified impacts never exceed medium

    let confidence = (containsFact ? fact!.confidence : mentions.has(id) ? 0.6 : 0.45) * (hop ? hop.edgeConfidence : 0.95) * Math.pow(0.9, Math.max(0, depth - 1));
    if (asset.scanStatus === "failed" || asset.scanStatus === "partial") confidence *= 0.8;

    impacts.push({
      assetId: id,
      level,
      depth,
      path,
      oldValue: current ?? change.oldValue,
      newValue: change.type === "deleted" ? null : change.newValue,
      currentValue: current,
      containsFact,
      confidence: Math.max(0.05, Math.min(0.99, round(confidence))),
      recommendedAction: recommend(change, asset, fact, containsFact, subject),
      reasons,
      inconsistent,
      location: fact?.location ?? null,
    });
  }

  impacts.sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || b.confidence - a.confidence || a.depth - b.depth || a.assetId.localeCompare(b.assetId));
  const capped = impacts.slice(0, IMPACT_LIMITS.maxImpacts);
  const counts = { critical: 0, high: 0, medium: 0, low: 0, direct: 0, indirect: 0, alreadyUpdated, inconsistencies: 0 };
  for (const i of capped) {
    counts[i.level]++;
    if (i.containsFact || i.depth <= 1) counts.direct++;
    else counts.indirect++;
    if (i.inconsistent) counts.inconsistencies++;
  }
  return { impacts: capped, skipped, counts, relatedFacts: [...related].sort().slice(0, 12) };
}

export function summarizeReport(title: string, report: ImpactReport): string {
  const c = report.counts;
  const total = report.impacts.length;
  if (!total) {
    return c.alreadyUpdated
      ? `${title}: every asset that holds this information already shows the new value (${c.alreadyUpdated}).`
      : `${title}: no other asset holds this information or depends on the source. Nothing needs updating.`;
  }
  const levels = LEVEL_ORDER.filter((l) => c[l]).map((l) => `${c[l]} ${l}`).join(", ");
  const parts = [`${title}: ${total} asset${total === 1 ? "" : "s"} affected (${levels}).`, `${c.direct} directly, ${c.indirect} through relationships.`];
  if (c.alreadyUpdated) parts.push(`${c.alreadyUpdated} already show the new value.`);
  if (c.inconsistencies) parts.push(`${c.inconsistencies} show an unexpected value and should be checked first.`);
  return parts.join(" ");
}

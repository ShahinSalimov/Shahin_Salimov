import type { Asset, AssetRelationship, ExtractedFact, RelationshipType } from "../workspace/model";
import { attributeKey, AUTHORITY, entityKey, IDENTIFIER_ATTRIBUTES, PAGE_LEVEL_ATTRIBUTES } from "./keys";

export interface RelationshipSuggestion {
  sourceAssetId: string;
  targetAssetId: string;
  type: RelationshipType;
  confidence: number;
  note: string;
  sharedFacts: number;
  matchingValues: number;
}

export const SUGGESTION_LIMITS = { minConfidence: 0.5, maxSuggestions: 50 } as const;

interface Profile {
  /** fact key → normalized values */
  facts: Map<string, Set<string>>;
  labels: Map<string, string>;
  identifiers: Set<string>;
}

function profiles(facts: ExtractedFact[], assetIds: Set<string>): Map<string, Profile> {
  const out = new Map<string, Profile>();
  for (const f of facts) {
    if (!assetIds.has(f.assetId)) continue;
    const attr = attributeKey(f.attributeName);
    if (PAGE_LEVEL_ATTRIBUTES.has(attr)) continue;
    let p = out.get(f.assetId);
    if (!p) out.set(f.assetId, (p = { facts: new Map(), labels: new Map(), identifiers: new Set() }));
    const key = `${entityKey(f.entityName)}|${attr}`;
    if (!p.facts.has(key)) p.facts.set(key, new Set());
    p.facts.get(key)!.add(f.normalizedValue);
    // Deterministic label regardless of fact order: the alphabetically first spelling.
    const label = `${f.entityName} · ${attr}`;
    const prev = p.labels.get(key);
    if (prev === undefined || label < prev) p.labels.set(key, label);
    // Contact details identify the business no matter how the entity is named on each asset.
    if (IDENTIFIER_ATTRIBUTES.has(attr)) p.identifiers.add(`${attr}:${f.normalizedValue}`);
  }
  return out;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Suggests relationships between assets that carry the same information.
 * Rules (deterministic, explainable — not AI):
 * - Two assets must share ≥2 entity/attribute facts, or ≥1 identifier (phone, email, address).
 * - Confidence grows with overlap and agreeing values; below 0.5 nothing is suggested.
 * - Pairs that already have any relationship (including rejected ones) are skipped,
 *   so a human "no" is never overridden.
 */
export function suggestRelationships(assets: Asset[], facts: ExtractedFact[], existing: AssetRelationship[]): RelationshipSuggestion[] {
  const active = assets.filter((a) => a.status === "active");
  const byId = new Map(active.map((a) => [a.id, a]));
  const prof = profiles(facts, new Set(byId.keys()));
  const taken = new Set(existing.map((r) => pairKey(r.sourceAssetId, r.targetAssetId)));
  const ids = [...prof.keys()].sort();
  const out: RelationshipSuggestion[] = [];

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [idA, idB] = [ids[i]!, ids[j]!];
      if (taken.has(pairKey(idA, idB))) continue;
      const [pa, pb] = [prof.get(idA)!, prof.get(idB)!];
      const shared = [...pa.facts.keys()].filter((k) => pb.facts.has(k)).sort();
      const sharedIds = [...pa.identifiers].filter((k) => pb.identifiers.has(k)).sort();
      if (shared.length < 2 && sharedIds.length === 0) continue;

      const matching = shared.filter((k) => [...pa.facts.get(k)!].some((v) => pb.facts.get(k)!.has(v))).length;
      const smaller = Math.max(1, Math.min(pa.facts.size, pb.facts.size));
      const overlap = Math.min(1, shared.length / smaller);
      const agreement = shared.length ? matching / shared.length : 1;
      const confidence = Math.min(0.95, Math.round((0.35 + 0.45 * overlap + 0.15 * agreement + (sharedIds.length ? 0.1 : 0)) * 100) / 100);
      if (confidence < SUGGESTION_LIMITS.minConfidence) continue;

      const [a, b] = [byId.get(idA)!, byId.get(idB)!];
      let source = a;
      let target = b;
      let type: RelationshipType;
      if (AUTHORITY[a.type] !== AUTHORITY[b.type]) {
        // The less authoritative asset depends on the more authoritative one.
        [source, target] = AUTHORITY[a.type] > AUTHORITY[b.type] ? [a, b] : [b, a];
        // "Derived from" needs real content overlap; a shared phone number alone is only a reference.
        type = AUTHORITY[target.type] === 0 && shared.length >= 2 && matching > 0 ? "derived_from" : "references";
      } else {
        type = agreement >= 0.9 && overlap >= 0.8 ? "duplicates" : "references";
        if ((prof.get(a.id)!.facts.size) < (prof.get(b.id)!.facts.size)) [source, target] = [a, b];
        else [source, target] = [b, a];
      }

      const labels = shared.slice(0, 3).map((k) => pa.labels.get(k)!);
      const parts = [
        shared.length ? `${shared.length} shared fact${shared.length === 1 ? "" : "s"} (${labels.join(", ")}${shared.length > 3 ? ", …" : ""})` : null,
        shared.length ? `${matching} with matching values${shared.length - matching ? `, ${shared.length - matching} different` : ""}` : null,
        sharedIds.length ? `same ${sharedIds.map((s) => s.split(":")[0]).join(", ")}` : null,
      ].filter(Boolean);
      out.push({ sourceAssetId: source.id, targetAssetId: target.id, type, confidence, note: `Suggested by rules: ${parts.join("; ")}.`.slice(0, 1000), sharedFacts: shared.length, matchingValues: matching });
    }
  }
  return out.sort((x, y) => y.confidence - x.confidence || y.sharedFacts - x.sharedFacts).slice(0, SUGGESTION_LIMITS.maxSuggestions);
}

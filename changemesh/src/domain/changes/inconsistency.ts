import { attributeKey, AUTHORITY, entityKey, PAGE_LEVEL_ATTRIBUTES } from "../graph/keys";
import type { Asset, ExtractedFact } from "../workspace/model";

export interface Inconsistency {
  type: "conflicting" | "outdated";
  key: string;
  entityName: string;
  attributeName: string;
  /** The authoritative asset (outdated) or the asset holding the most common value (conflicting). */
  sourceAssetId: string;
  /** Value(s) that differ. */
  oldValue: string;
  /** Value of the source of truth (outdated) or the most common value (conflicting). */
  newValue: string;
  assetIds: string[];
  description: string;
}

/**
 * Finds facts that differ between assets.
 * - outdated: the most authoritative assets agree on one value and others differ
 *   (e.g. the price list says $15, the website still says $12)
 * - conflicting: assets of equal authority disagree and no source of truth decides
 */
export function findInconsistencies(assets: Asset[], facts: ExtractedFact[]): Inconsistency[] {
  const active = new Map(assets.filter((a) => a.status === "active").map((a) => [a.id, a]));
  const groups = new Map<string, { entity: string; attribute: string; byAsset: Map<string, ExtractedFact> }>();
  for (const f of facts) {
    if (!active.has(f.assetId)) continue;
    const attr = attributeKey(f.attributeName);
    if (PAGE_LEVEL_ATTRIBUTES.has(attr)) continue;
    const key = `${entityKey(f.entityName)}|${attr}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { entity: f.entityName, attribute: attr, byAsset: new Map() }));
    const prev = g.byAsset.get(f.assetId);
    if (!prev || f.confidence > prev.confidence) g.byAsset.set(f.assetId, f);
  }

  const out: Inconsistency[] = [];
  for (const [key, g] of groups) {
    if (g.byAsset.size < 2) continue;
    const values = new Set([...g.byAsset.values()].map((f) => f.normalizedValue));
    if (values.size < 2) continue;
    const entries = [...g.byAsset.entries()].map(([id, f]) => ({ id, f, authority: AUTHORITY[active.get(id)!.type] }));
    const best = Math.min(...entries.map((e) => e.authority));
    const top = entries.filter((e) => e.authority === best);
    const topValues = new Set(top.map((e) => e.f.normalizedValue));
    const others = entries.filter((e) => e.authority > best);
    const name = (id: string) => active.get(id)!.name;

    if (topValues.size === 1 && others.some((e) => !topValues.has(e.f.normalizedValue))) {
      const truth = top[0]!;
      const stale = others.filter((e) => e.f.normalizedValue !== truth.f.normalizedValue).sort((a, b) => name(a.id).localeCompare(name(b.id)));
      out.push({
        type: "outdated",
        key,
        entityName: g.entity,
        attributeName: g.attribute,
        sourceAssetId: truth.id,
        oldValue: [...new Set(stale.map((e) => e.f.valueText))].join(" / "),
        newValue: truth.f.valueText,
        assetIds: stale.map((e) => e.id),
        description: `${name(truth.id)} (source of truth) says ${truth.f.valueText}; ${stale.map((e) => `${name(e.id)} says ${e.f.valueText}`).join(", ")}.`,
      });
    } else {
      const counts = new Map<string, { n: number; display: string; ids: string[] }>();
      for (const e of entries) {
        const c = counts.get(e.f.normalizedValue) ?? { n: 0, display: e.f.valueText, ids: [] };
        c.n++;
        c.ids.push(e.id);
        counts.set(e.f.normalizedValue, c);
      }
      const ranked = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
      const [major, ...rest] = ranked;
      out.push({
        type: "conflicting",
        key,
        entityName: g.entity,
        attributeName: g.attribute,
        sourceAssetId: major![1].ids.sort((a, b) => name(a).localeCompare(name(b)))[0]!,
        oldValue: rest.map(([, c]) => c.display).join(" / "),
        newValue: major![1].display,
        assetIds: entries.map((e) => e.id).sort(),
        description: ranked.map(([, c]) => `${c.ids.map(name).sort().join(", ")}: ${c.display}`).join(" · "),
      });
    }
  }
  return out.sort((a, b) => (a.type === b.type ? a.entityName.localeCompare(b.entityName) : a.type === "outdated" ? -1 : 1));
}

import { attributeKey, entityKey, PAGE_LEVEL_ATTRIBUTES } from "../graph/keys";

export interface FactLike {
  entityName: string;
  attributeName: string;
  valueText: string;
  normalizedValue: string;
}

export interface DetectedChange {
  type: "created" | "updated" | "deleted";
  key: string;
  entityName: string;
  attributeName: string;
  oldValue: string | null;
  newValue: string | null;
}

interface Bucket {
  entity: string;
  attribute: string;
  values: Map<string, string>; // normalized → display
}

function bucket(facts: FactLike[]): Map<string, Bucket> {
  const out = new Map<string, Bucket>();
  for (const f of facts) {
    const attr = attributeKey(f.attributeName);
    if (PAGE_LEVEL_ATTRIBUTES.has(attr)) continue;
    const key = `${entityKey(f.entityName)}|${attr}`;
    let b = out.get(key);
    if (!b) out.set(key, (b = { entity: f.entityName, attribute: attr, values: new Map() }));
    if (!b.values.has(f.normalizedValue)) b.values.set(f.normalizedValue, f.valueText);
  }
  return out;
}

function display(b: Bucket): string {
  return [...b.values.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([, v]) => v).join(" / ");
}

function sameValues(a: Bucket, b: Bucket): boolean {
  return a.values.size === b.values.size && [...a.values.keys()].every((k) => b.values.has(k));
}

/**
 * Compares the facts of two versions of the same asset and returns what was
 * created, updated or deleted. Page-level descriptors (title, meta) are ignored.
 */
export function diffFacts(previous: FactLike[], next: FactLike[]): DetectedChange[] {
  const before = bucket(previous);
  const after = bucket(next);
  const out: DetectedChange[] = [];
  for (const [key, b] of after) {
    const a = before.get(key);
    if (!a) out.push({ type: "created", key, entityName: b.entity, attributeName: b.attribute, oldValue: null, newValue: display(b) });
    else if (!sameValues(a, b)) out.push({ type: "updated", key, entityName: b.entity, attributeName: b.attribute, oldValue: display(a), newValue: display(b) });
  }
  for (const [key, a] of before) {
    if (!after.has(key)) out.push({ type: "deleted", key, entityName: a.entity, attributeName: a.attribute, oldValue: display(a), newValue: null });
  }
  const order = { updated: 0, deleted: 1, created: 2 } as const;
  return out.sort((x, y) => order[x.type] - order[y.type] || x.entityName.localeCompare(y.entityName) || x.attributeName.localeCompare(y.attributeName));
}

export function changeTitle(c: Pick<DetectedChange, "type" | "entityName" | "attributeName" | "oldValue" | "newValue">): string {
  const subject = `${c.entityName} ${c.attributeName}`;
  const t =
    c.type === "updated" ? `${subject}: ${c.oldValue} → ${c.newValue}` : c.type === "created" ? `New ${subject}: ${c.newValue}` : `${subject} removed (was ${c.oldValue})`;
  return t.length > 200 ? `${t.slice(0, 199)}…` : t;
}

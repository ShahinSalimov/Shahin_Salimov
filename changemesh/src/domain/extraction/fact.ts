import { cleanInline } from "./sanitize";
import { normalizeValue } from "./normalize";

export const EXTRACTION_METHODS = ["csv", "html", "json_ld", "pdf_text", "plain_text", "manual"] as const;
export type ExtractionMethod = (typeof EXTRACTION_METHODS)[number];

export interface SourceLocation {
  kind: "row" | "page" | "element" | "json_ld" | "line" | "meta" | "link" | "manual";
  row?: number;
  column?: string;
  page?: number;
  line?: number;
  path?: string;
  /** Short excerpt of the original text, for evidence. */
  snippet?: string;
}

/** A fact before it is saved. Mirrors public.extracted_facts. */
export interface FactDraft {
  entityName: string;
  attributeName: string;
  valueText: string;
  valueNumber: number | null;
  valueUnit: string | null;
  normalizedValue: string;
  location: SourceLocation;
  confidence: number;
  method: ExtractionMethod;
}

export const MAX_FACTS_PER_SCAN = 5000;

/** Builds a cleaned, normalized fact or returns null if it would be empty. */
export function makeFact(entity: string, attribute: string, value: string, location: SourceLocation, confidence: number, method: ExtractionMethod): FactDraft | null {
  const entityName = cleanInline(entity, 300);
  const attributeName = cleanInline(attribute, 200).toLowerCase();
  const valueText = cleanInline(value, 2000);
  if (!entityName || !attributeName || !valueText) return null;
  const n = normalizeValue(attributeName, valueText);
  return {
    entityName,
    attributeName,
    valueText,
    valueNumber: n.number,
    valueUnit: n.unit,
    normalizedValue: n.normalized.slice(0, 2000),
    location: { ...location, snippet: location.snippet ? cleanInline(location.snippet, 200) : undefined },
    confidence: Math.max(0, Math.min(1, Math.round(confidence * 1000) / 1000)),
    method,
  };
}

/** Removes duplicates (same entity, attribute and normalized value), keeping the most confident. */
export function dedupeFacts(facts: FactDraft[]): FactDraft[] {
  const best = new Map<string, FactDraft>();
  for (const f of facts) {
    const key = `${f.entityName.toLowerCase()}\u0000${f.attributeName}\u0000${f.normalizedValue}`;
    const prev = best.get(key);
    if (!prev || f.confidence > prev.confidence) best.set(key, f);
  }
  return [...best.values()];
}

export function capFacts(facts: FactDraft[], max = MAX_FACTS_PER_SCAN): { facts: FactDraft[]; dropped: number } {
  if (facts.length <= max) return { facts, dropped: 0 };
  return { facts: facts.slice(0, max), dropped: facts.length - max };
}

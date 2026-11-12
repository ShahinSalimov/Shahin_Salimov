import Papa from "papaparse";
import { capFacts, dedupeFacts, makeFact, type FactDraft } from "./fact";
import { EMAIL_RE, findMoney, isPlausiblePhone, parseAmount } from "./normalize";
import { cleanInline } from "./sanitize";

export type ColumnType = "text" | "number" | "currency" | "percent" | "date" | "boolean" | "email" | "url" | "phone" | "empty";

export interface CsvColumn {
  name: string;
  type: ColumnType;
  filled: number;
  unique: number;
  sample: string[];
}

export interface CsvAnalysis {
  delimiter: string;
  hasHeader: boolean;
  columns: CsvColumn[];
  rowCount: number;
  validRows: number;
  malformedRows: number[];
  entityColumn: string | null;
  entityKind: string | null;
  entityCount: number;
  facts: FactDraft[];
  warnings: string[];
  truncated: boolean;
}

export const CSV_LIMITS = { maxRows: 5000, maxColumns: 50 } as const;

const ENTITY_HEADER = /\b(name|item|product|title|dish|service|location|branch|store|sku|model|menu item|ad|adı|məhsul|ürün|isim)\b/i;
const KIND: [RegExp, string][] = [
  [/(product|item|sku|model|məhsul|ürün)/i, "Products"],
  [/(dish|menu)/i, "Menu items"],
  [/(location|branch|store|filial|şube)/i, "Locations"],
  [/(service|xidmət|hizmet)/i, "Services"],
  [/(employee|staff|person|contact)/i, "People"],
];

function typeOf(v: string): ColumnType {
  const s = v.trim();
  if (!s) return "empty";
  if (/^(true|false|yes|no|y|n|bəli|xeyr|evet|hayır)$/i.test(s)) return "boolean";
  if (/^-?\d+(?:[.,]\d+)?\s?%$/.test(s)) return "percent";
  if (findMoney(s)[0]?.raw === s) return "currency";
  if (/^-?[\d.,\s]+$/.test(s) && parseAmount(s.replace(/^-/, "")) !== null) return "number";
  if (/^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/.test(s) || /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(s)) return "date";
  if (new RegExp(`^${EMAIL_RE.source}$`, "i").test(s)) return "email";
  if (/^https?:\/\/\S+$/i.test(s)) return "url";
  if (/^\+?[\d\s().-]{7,}$/.test(s) && isPlausiblePhone(s)) return "phone";
  return "text";
}

function dominantType(values: string[]): ColumnType {
  const counts = new Map<ColumnType, number>();
  for (const v of values) {
    const t = typeOf(v);
    if (t !== "empty") counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (!total) return "empty";
  const [best, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  if (best === "number" && (counts.get("currency") ?? 0) > 0) return "currency";
  return n / total >= 0.8 ? best : "text";
}

function looksLikeHeader(row: string[]): boolean {
  const cells = row.map((c) => c.trim());
  if (!cells.length || cells.some((c) => !c)) return false;
  return cells.every((c) => typeOf(c) === "text" && c.length <= 80) && new Set(cells.map((c) => c.toLowerCase())).size === cells.length;
}

function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const base = cleanInline(h, 100) || `Column ${i + 1}`;
    const n = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), n);
    return n > 1 ? `${base} (${n})` : base;
  });
}

/**
 * Detects columns, records and the column that names the business entities,
 * then turns every other cell into a fact: (entity, column header, value).
 */
export function analyzeCsv(text: string, opts: { assetName: string; maxFacts?: number }): CsvAnalysis {
  const warnings: string[] = [];
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", delimitersToGuess: [",", ";", "\t", "|"], preview: CSV_LIMITS.maxRows + 1 });
  const all = parsed.data.filter((r) => Array.isArray(r));
  const delimiter = parsed.meta.delimiter || ",";
  const empty: CsvAnalysis = { delimiter, hasHeader: false, columns: [], rowCount: 0, validRows: 0, malformedRows: [], entityColumn: null, entityKind: null, entityCount: 0, facts: [], warnings, truncated: false };
  if (!all.length) {
    warnings.push("The file contains no rows.");
    return empty;
  }

  const hasHeader = looksLikeHeader(all[0]!);
  let width = (all[0] ?? []).length;
  if (width > CSV_LIMITS.maxColumns) {
    warnings.push(`Only the first ${CSV_LIMITS.maxColumns} of ${width} columns were analyzed.`);
    width = CSV_LIMITS.maxColumns;
  }
  const headers = uniqueHeaders(hasHeader ? all[0]!.slice(0, width) : Array.from({ length: width }, (_, i) => `Column ${i + 1}`));
  if (!hasHeader) warnings.push("No header row was detected; columns were named Column 1, Column 2, …");

  const body = hasHeader ? all.slice(1) : all;
  const truncated = body.length > CSV_LIMITS.maxRows || Boolean(parsed.meta.truncated);
  const rowsIn = body.slice(0, CSV_LIMITS.maxRows);
  if (truncated) warnings.push(`Only the first ${CSV_LIMITS.maxRows} rows were analyzed.`);

  const malformedRows: number[] = [];
  const rows: { line: number; cells: string[] }[] = [];
  const fullWidth = (all[0] ?? []).length;
  rowsIn.forEach((r, i) => {
    const line = i + 1 + (hasHeader ? 1 : 0);
    if (r.length !== fullWidth) malformedRows.push(line);
    else rows.push({ line, cells: r.slice(0, width).map((c) => c ?? "") });
  });
  if (malformedRows.length) {
    const list = malformedRows.slice(0, 10).join(", ");
    warnings.push(`${malformedRows.length} row(s) have a different number of columns than the header and were skipped (lines ${list}${malformedRows.length > 10 ? ", …" : ""}).`);
  }

  const columns: CsvColumn[] = headers.map((name, ci) => {
    const values = rows.map((r) => r.cells[ci]!.trim());
    const filled = values.filter(Boolean);
    return { name, type: dominantType(values), filled: filled.length, unique: new Set(filled.map((v) => v.toLowerCase())).size, sample: [...new Set(filled)].slice(0, 3).map((v) => cleanInline(v, 60)) };
  });

  // Entity column: a mostly-unique text column, preferring name-like headers.
  const candidates = columns
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.type === "text" && c.filled > 0 && c.unique / Math.max(c.filled, 1) >= 0.8);
  const chosen = candidates.find(({ c }) => ENTITY_HEADER.test(c.name)) ?? candidates[0];
  const entityIdx = chosen?.i ?? -1;
  const entityColumn = chosen ? chosen.c.name : null;
  if (!chosen) warnings.push("No column uniquely names the records; facts use the row number as the entity.");
  const confidence = chosen && ENTITY_HEADER.test(chosen.c.name) ? 0.9 : 0.8;

  let formulaCells = 0;
  const facts: FactDraft[] = [];
  for (const { line, cells } of rows) {
    const entity = entityIdx >= 0 ? cells[entityIdx]!.trim() : `${opts.assetName} row ${line}`;
    if (!entity) continue;
    cells.forEach((value, ci) => {
      if (ci === entityIdx || !value.trim()) return;
      if (/^[=+@]/.test(value.trim()) || /^-[^\d]/.test(value.trim())) formulaCells++;
      const f = makeFact(entity, headers[ci]!, value, { kind: "row", row: line, column: headers[ci] }, confidence, "csv");
      if (f) facts.push(f);
    });
  }
  if (formulaCells) warnings.push(`${formulaCells} cell(s) start with a formula character (=, +, -, @). They are stored as plain text and never evaluated.`);

  const deduped = dedupeFacts(facts);
  const capped = capFacts(deduped, opts.maxFacts);
  if (capped.dropped) warnings.push(`${capped.dropped} facts were not saved because a scan can store at most ${capped.facts.length}.`);

  const kind = entityColumn ? (KIND.find(([re]) => re.test(entityColumn))?.[1] ?? "Records") : null;
  return {
    delimiter,
    hasHeader,
    columns,
    rowCount: rowsIn.length,
    validRows: rows.length,
    malformedRows,
    entityColumn,
    entityKind: kind,
    entityCount: entityIdx >= 0 ? new Set(rows.map((r) => r.cells[entityIdx]!.trim().toLowerCase()).filter(Boolean)).size : 0,
    facts: capped.facts,
    warnings,
    truncated: truncated || capped.dropped > 0,
  };
}

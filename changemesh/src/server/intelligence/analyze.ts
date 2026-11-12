import { createHash } from "node:crypto";
import { analyzeCsv } from "@/domain/extraction/csv";
import { capFacts, dedupeFacts, type FactDraft } from "@/domain/extraction/fact";
import { extractHtml } from "@/domain/extraction/html";
import { cleanMultiline } from "@/domain/extraction/sanitize";
import { extractFromLines } from "@/domain/extraction/text-patterns";
import type { PdfText } from "./pdf";

/** Outcome of reading one piece of content, before it is saved. */
export interface ScanResult {
  status: "succeeded" | "partial" | "failed";
  contentHash: string | null;
  summary: Record<string, unknown>;
  facts: FactDraft[];
  warnings: string[];
  /** For failed scans: the reason. For partial scans: what was incomplete. */
  error: string | null;
  stats: Record<string, number | string | boolean>;
}

const EXCERPT = 5000;
const MAX_WARNINGS = 30;

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function finish(base: Omit<ScanResult, "status" | "error">, incomplete: boolean, failReason?: string): ScanResult {
  const warnings = base.warnings.slice(0, MAX_WARNINGS);
  if (failReason) return { ...base, warnings, facts: [], status: "failed", error: failReason };
  const capped = capFacts(dedupeFacts(base.facts));
  if (capped.dropped) warnings.push(`${capped.dropped} facts were not saved because a scan can store at most ${capped.facts.length}.`);
  const partial = incomplete || capped.dropped > 0;
  return { ...base, facts: capped.facts, warnings, status: partial ? "partial" : "succeeded", error: partial ? warnings.join(" ").slice(0, 2000) || "The content was only partly analyzed." : null };
}

export function analyzeHtmlPage(input: { html: string; assetName: string; url: string; finalUrl: string; truncated: boolean; httpStatus: number; bytes: number; durationMs: number; redirects: string[] }): ScanResult {
  const r = extractHtml(input.html, { assetName: input.assetName, url: input.finalUrl });
  const warnings = [...r.warnings];
  if (input.truncated) warnings.unshift("The page is larger than the 2 MB scan limit; only the beginning was analyzed.");
  if (input.redirects.length) warnings.push(`Redirected to ${input.finalUrl}.`);
  return finish(
    {
      contentHash: sha256(r.text + JSON.stringify(r.facts.map((f) => [f.entityName, f.attributeName, f.normalizedValue]))),
      summary: { kind: "website", url: input.url, finalUrl: input.finalUrl, title: r.title, description: r.description, lang: r.lang, headings: r.headings.slice(0, 20), textExcerpt: r.text.slice(0, EXCERPT) },
      facts: r.facts,
      warnings,
      stats: { httpStatus: input.httpStatus, bytes: input.bytes, durationMs: input.durationMs, textChars: r.stats.textChars, jsonLdBlocks: r.stats.jsonLdBlocks, redirects: input.redirects.length },
    },
    input.truncated || !r.text,
  );
}

export function analyzeCsvFile(input: { text: string; bytes: number; hash: string; fileName: string; assetName: string; decodeWarning: string | null }): ScanResult {
  const r = analyzeCsv(input.text, { assetName: input.assetName });
  const warnings = [...(input.decodeWarning ? [input.decodeWarning] : []), ...r.warnings];
  const base = {
    contentHash: input.hash,
    summary: { kind: "csv", fileName: input.fileName, delimiter: r.delimiter, hasHeader: r.hasHeader, rows: r.rowCount, validRows: r.validRows, columns: r.columns, entityColumn: r.entityColumn, entityKind: r.entityKind, entityCount: r.entityCount },
    facts: r.facts,
    warnings,
    stats: { bytes: input.bytes, rows: r.rowCount, validRows: r.validRows, malformedRows: r.malformedRows.length, columns: r.columns.length },
  };
  if (r.validRows === 0) return finish(base, false, r.rowCount === 0 ? "The CSV file contains no data rows." : "None of the rows could be read; every row has a different number of columns than the header.");
  return finish(base, r.malformedRows.length > 0 || r.truncated || Boolean(input.decodeWarning));
}

export function analyzePdf(input: { pdf: PdfText; bytes: number; hash: string; fileName: string; assetName: string }): ScanResult {
  const { pdf } = input;
  const lines = pdf.pages.flatMap((page, pi) =>
    page.split("\n").map((text, li) => ({ text: text.trim(), location: { kind: "page" as const, page: pi + 1, line: li + 1 } })).filter((l) => l.text),
  );
  const facts = extractFromLines(lines, { method: "pdf_text", defaultEntity: input.assetName });
  const warnings: string[] = [];
  if (pdf.emptyPages.length) warnings.push(`${pdf.emptyPages.length} of ${pdf.pages.length} page(s) contain no extractable text (pages ${pdf.emptyPages.slice(0, 10).join(", ")}${pdf.emptyPages.length > 10 ? ", …" : ""}). They may be scanned images; OCR is not supported yet.`);
  if (pdf.truncated) warnings.push(`Only the first ${pdf.pages.length} of ${pdf.numPages} pages were analyzed.`);
  if (!facts.length && lines.length) warnings.push("Text was found, but no prices, contact details or opening hours were recognized.");
  const text = cleanMultiline(pdf.pages.join("\n\n"), EXCERPT);
  const base = {
    contentHash: input.hash,
    summary: { kind: "pdf", fileName: input.fileName, pages: pdf.numPages, pagesRead: pdf.pages.length, emptyPages: pdf.emptyPages, textExcerpt: text },
    facts,
    warnings,
    stats: { bytes: input.bytes, pages: pdf.numPages, emptyPages: pdf.emptyPages.length, lines: lines.length },
  };
  if (!lines.length) return finish(base, false, "The PDF contains no extractable text. It may consist of scanned images; OCR is not supported yet.");
  return finish(base, pdf.emptyPages.length > 0 || pdf.truncated);
}

export function analyzeTextFile(input: { text: string; bytes: number; hash: string; fileName: string; assetName: string; decodeWarning: string | null }): ScanResult {
  const lines = input.text.split(/\r?\n/).map((text, i) => ({ text: text.trim(), location: { kind: "line" as const, line: i + 1 } })).filter((l) => l.text);
  const facts = extractFromLines(lines.slice(0, 20_000), { method: "plain_text", defaultEntity: input.assetName });
  const warnings = input.decodeWarning ? [input.decodeWarning] : [];
  if (lines.length > 20_000) warnings.push("Only the first 20,000 lines were analyzed.");
  if (!facts.length && lines.length) warnings.push("Text was found, but no prices, contact details or opening hours were recognized.");
  const base = {
    contentHash: input.hash,
    summary: { kind: "text", fileName: input.fileName, lines: lines.length, textExcerpt: cleanMultiline(input.text, EXCERPT) },
    facts,
    warnings,
    stats: { bytes: input.bytes, lines: lines.length },
  };
  if (!lines.length) return finish(base, false, "The file contains no text.");
  return finish(base, lines.length > 20_000 || Boolean(input.decodeWarning));
}

export function failed(reason: string, stats: ScanResult["stats"] = {}): ScanResult {
  return { status: "failed", contentHash: null, summary: {}, facts: [], warnings: [], error: reason, stats };
}

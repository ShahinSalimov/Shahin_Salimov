import type { ExtractionMethod, SourceLocation } from "@/domain/extraction/fact";

export const METHOD_LABEL: Record<ExtractionMethod, string> = {
  csv: "CSV",
  html: "Web page",
  json_ld: "Structured data",
  pdf_text: "PDF text",
  plain_text: "Text",
  manual: "Manual",
};

export function formatLocation(loc: SourceLocation): string {
  switch (loc.kind) {
    case "row":
      return `Row ${loc.row ?? "?"}${loc.column ? ` · ${loc.column}` : ""}`;
    case "page":
      return `Page ${loc.page ?? "?"}${loc.line ? `, line ${loc.line}` : ""}`;
    case "line":
      return `Line ${loc.line ?? "?"}`;
    case "json_ld":
      return `Structured data · ${loc.path ?? ""}`;
    case "meta":
      return "Page metadata";
    case "link":
      return `Link${loc.path ? ` · ${loc.path}` : ""}`;
    case "element":
      return loc.path ?? "Page element";
    case "manual":
      return "Entered manually";
  }
}

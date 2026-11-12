import type { SourceLocation } from "./fact";

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

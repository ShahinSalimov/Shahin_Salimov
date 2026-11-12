import type { ExtractionMethod } from "@/domain/extraction/fact";

export const METHOD_LABEL: Record<ExtractionMethod, string> = {
  csv: "CSV",
  html: "Web page",
  json_ld: "Structured data",
  pdf_text: "PDF text",
  plain_text: "Text",
  manual: "Manual",
};

export { formatLocation } from "@/domain/extraction/location";

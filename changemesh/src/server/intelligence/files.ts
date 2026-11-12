import { ScanError } from "./errors";

export type FileKind = "pdf" | "csv" | "text";

export const UPLOAD_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxCsvBytes: 5 * 1024 * 1024,
  maxTextBytes: 2 * 1024 * 1024,
} as const;

const EXT: Record<string, FileKind> = { pdf: "pdf", csv: "csv", tsv: "csv", txt: "text", md: "text", markdown: "text" };
export const ACCEPTED_EXTENSIONS = ".pdf,.csv,.tsv,.txt,.md";
export const MIME: Record<FileKind, string> = { pdf: "application/pdf", csv: "text/csv", text: "text/plain" };

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

/**
 * Decides how to read an uploaded file from its content (magic bytes), not
 * only from its name. Unsupported or disguised files are rejected with a clear message.
 */
export function detectFileKind(bytes: Uint8Array, fileName: string): FileKind {
  if (bytes.length === 0) throw new ScanError("The file is empty.");
  if (bytes.length > UPLOAD_LIMITS.maxBytes) throw new ScanError(`The file is larger than ${UPLOAD_LIMITS.maxBytes / 1024 / 1024} MB.`);
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const isPdf = startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
  if (isPdf) return "pdf";
  if (ext === "pdf") throw new ScanError("The file is named .pdf but its content is not a PDF.");
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) throw new ScanError("Office documents (.docx, .xlsx, .pptx) and ZIP files are not supported yet. Export to PDF or CSV and upload again.");
  const head = bytes.subarray(0, 8192);
  if (head.includes(0)) throw new ScanError("This looks like a binary file. Supported formats: PDF, CSV and plain text.");
  const kind = EXT[ext];
  if (!kind) throw new ScanError(`Files of type .${ext || "unknown"} are not supported. Supported formats: PDF, CSV and plain text.`);
  if (kind === "csv" && bytes.length > UPLOAD_LIMITS.maxCsvBytes) throw new ScanError(`CSV files can be at most ${UPLOAD_LIMITS.maxCsvBytes / 1024 / 1024} MB.`);
  if (kind === "text" && bytes.length > UPLOAD_LIMITS.maxTextBytes) throw new ScanError(`Text files can be at most ${UPLOAD_LIMITS.maxTextBytes / 1024 / 1024} MB.`);
  return kind;
}

/** UTF-8 (with or without BOM); falls back to Windows-1252 with a warning. */
export function decodeTextFile(bytes: Uint8Array): { text: string; warning: string | null } {
  const body = startsWith(bytes, [0xef, 0xbb, 0xbf]) ? bytes.subarray(3) : bytes;
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), warning: null };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(body), warning: "The file is not valid UTF-8; it was read as Windows-1252. Check special characters." };
  }
}

/** File names are shown in the UI; keep them short and free of path parts. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120) || "file";
}

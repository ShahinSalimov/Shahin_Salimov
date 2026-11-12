import "server-only";
import { ScanError } from "./errors";

export const PDF_LIMITS = { maxPages: 100, timeoutMs: 20_000 } as const;

export interface PdfText {
  numPages: number;
  pages: string[];
  emptyPages: number[];
  truncated: boolean;
}

/** Extracts text per page. Image-only pages are reported, not guessed. */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const work = (async () => {
    let pdf;
    try {
      pdf = await getDocumentProxy(new Uint8Array(bytes));
    } catch (error) {
      const msg = String((error as Error)?.message ?? "");
      if (/password/i.test(msg)) throw new ScanError("The PDF is password-protected. Upload an unprotected version.");
      throw new ScanError("The PDF could not be opened; it may be damaged.");
    }
    const numPages = pdf.numPages;
    const { text } = await extractText(pdf, { mergePages: false });
    const all = Array.isArray(text) ? text : [text];
    const pages = all.slice(0, PDF_LIMITS.maxPages);
    const emptyPages = pages.map((p, i) => (p.trim() ? -1 : i + 1)).filter((i) => i > 0);
    return { numPages, pages, emptyPages, truncated: numPages > PDF_LIMITS.maxPages };
  })();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ScanError(`Reading the PDF took longer than ${PDF_LIMITS.timeoutMs / 1000} s.`)), PDF_LIMITS.timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

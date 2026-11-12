import "server-only";
import type { Asset } from "@/domain/workspace/model";
import { logger } from "@/lib/logger";
import type { StoredFile, WorkspaceData } from "../data/source";
import { analyzeCsvFile, analyzeHtmlPage, analyzePdf, analyzeTextFile, failed, sha256, type ScanResult } from "./analyze";
import { ScanError } from "./errors";
import { decodeTextFile, detectFileKind, MIME, safeFileName } from "./files";
import { extractPdfText } from "./pdf";
import { decodeHtml, safeFetchHtml, type FetchOptions } from "./safe-fetch";

export interface ScanOutcome {
  status: ScanResult["status"];
  message: string;
  factsCount: number;
  assetVersion: number | null;
  newVersion: boolean;
}

async function run(data: WorkspaceData, asset: Asset, kind: "website" | "upload", produce: () => Promise<{ result: ScanResult; file?: StoredFile }>): Promise<ScanOutcome> {
  const scanId = await data.startScan(asset.id, kind);
  let result: ScanResult;
  let file: StoredFile | undefined;
  try {
    ({ result, file } = await produce());
  } catch (error) {
    if (error instanceof ScanError) result = failed(error.message);
    else {
      logger.error("scan.unexpected_error", { assetId: asset.id, kind, error });
      result = failed("An unexpected error stopped the scan. No results were saved.");
    }
  }
  const recorded = await data.recordScan(scanId, result, file);
  logger.info("scan.finished", { assetId: asset.id, kind, status: result.status, facts: recorded.factsCount, newVersion: recorded.newVersion });

  const v = recorded.assetVersion ? `v${recorded.assetVersion}` : "";
  let message: string;
  if (result.status === "failed") message = `Scan failed: ${result.error}`;
  else if (!recorded.newVersion) message = `No changes since ${v}. ${recorded.factsCount} facts unchanged.`;
  else if (result.status === "partial") message = `Partially analyzed (${v}): ${recorded.factsCount} facts saved. Some content could not be read — see the warnings.`;
  else message = `Scan complete (${v}): ${recorded.factsCount} facts extracted.`;
  return { status: result.status, message, factsCount: recorded.factsCount, assetVersion: recorded.assetVersion, newVersion: recorded.newVersion };
}

/** Fetches the asset's public page once (no crawling) and extracts its content. */
export function scanWebsite(data: WorkspaceData, asset: Asset, fetchOptions?: FetchOptions): Promise<ScanOutcome> {
  return run(data, asset, "website", async () => {
    if (!asset.sourceUrl) throw new ScanError("This asset has no URL to scan.");
    const page = await safeFetchHtml(asset.sourceUrl, fetchOptions);
    const html = decodeHtml(page.body, page.contentType);
    return {
      result: analyzeHtmlPage({ html, assetName: asset.name, url: asset.sourceUrl, finalUrl: page.finalUrl, truncated: page.truncated, httpStatus: page.status, bytes: page.body.length, durationMs: page.durationMs, redirects: page.redirects }),
    };
  });
}

/** Validates, analyzes and (outside demo mode) stores an uploaded file as a new asset version. */
export function ingestUpload(data: WorkspaceData, asset: Asset, upload: { name: string; bytes: Uint8Array }): Promise<ScanOutcome> {
  return run(data, asset, "upload", async () => {
    const fileName = safeFileName(upload.name);
    const kind = detectFileKind(upload.bytes, fileName);
    const hash = sha256(upload.bytes);
    const common = { bytes: upload.bytes.length, hash, fileName, assetName: asset.name };
    let result: ScanResult;
    if (kind === "pdf") result = analyzePdf({ ...common, pdf: await extractPdfText(upload.bytes) });
    else {
      const { text, warning } = decodeTextFile(upload.bytes);
      result = kind === "csv" ? analyzeCsvFile({ ...common, text, decodeWarning: warning }) : analyzeTextFile({ ...common, text, decodeWarning: warning });
    }
    if (result.status === "failed") return { result };
    const extension = kind === "pdf" ? "pdf" : kind === "csv" ? "csv" : "txt";
    const storagePath = await data.storeOriginal(asset.id, { bytes: upload.bytes, contentType: MIME[kind], hash, extension });
    return { result, file: { storagePath, mimeType: MIME[kind], sizeBytes: upload.bytes.length, fileName } };
  });
}

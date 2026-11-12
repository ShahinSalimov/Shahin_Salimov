import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";
import { ScanError } from "./errors";
import { checkUrl, isPublicAddress } from "./url-guard";

export interface FetchLimits {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
}

export const DEFAULT_LIMITS: FetchLimits = { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 3 };

export interface FetchedPage {
  finalUrl: string;
  status: number;
  contentType: string;
  body: Buffer;
  truncated: boolean;
  redirects: string[];
  durationMs: number;
}

export interface FetchOptions {
  limits?: Partial<FetchLimits>;
  /** DNS resolver (tests inject a fake one). */
  resolve?: (host: string) => Promise<LookupAddress[]>;
  /** Address policy (tests may allow loopback). Defaults to public addresses only. */
  isAllowedAddress?: (ip: string) => boolean;
  /** Ports allowed in URLs. Defaults to 80/443; tests use a local ephemeral port. */
  allowedPorts?: ReadonlySet<string>;
}

const USER_AGENT = "CHANGEMESH-Scanner/0.1 (+asset consistency check; single page, no crawling)";

function defaultResolve(host: string): Promise<LookupAddress[]> {
  return new Promise((resolve, reject) => dnsLookup(host, { all: true, verbatim: true }, (err, addrs) => (err ? reject(err) : resolve(addrs))));
}

/**
 * The connection-time DNS hook: every address the host resolves to must be
 * allowed, otherwise the connection is refused. This closes DNS-rebinding gaps
 * because the checked address is the one actually used for the socket.
 */
function guardedLookup(resolve: NonNullable<FetchOptions["resolve"]>, allowed: (ip: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname)
      .then((addrs) => {
        if (!addrs.length) return callback(new ScanError("The host name could not be resolved."), "", 4);
        if (addrs.some((a) => !allowed(a.address))) return callback(new ScanError("This host resolves to a private or internal network address and cannot be scanned."), "", 4);
        const opts = options as { all?: boolean };
        if (opts.all) (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addrs);
        else callback(null, addrs[0]!.address, addrs[0]!.family);
      })
      .catch(() => callback(new ScanError("The host name could not be resolved."), "", 4));
  };
}

function requestOnce(url: URL, opts: Required<Pick<FetchOptions, "resolve" | "isAllowedAddress">>, limits: FetchLimits, deadline: number): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new ScanError(`The page did not respond within ${limits.timeoutMs / 1000} s.`));
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        agent: false, // never reuse sockets or follow HTTP(S)_PROXY settings
        lookup: guardedLookup(opts.resolve, opts.isAllowedAddress),
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "accept-encoding": "gzip, deflate, br", "accept-language": "en;q=0.9,*;q=0.5" },
        timeout: remaining,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, headers: res.headers, body: Buffer.alloc(0), truncated: false });
        }
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (encoding === "gzip" || encoding === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (encoding === "deflate") stream = res.pipe(zlib.createInflate());
        else if (encoding === "br") stream = res.pipe(zlib.createBrotliDecompress());

        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        stream.on("data", (chunk: Buffer) => {
          if (truncated) return;
          size += chunk.length;
          if (size > limits.maxBytes) {
            // Decompressed size is limited too, so a compression bomb cannot exhaust memory.
            chunks.push(chunk.subarray(0, chunk.length - (size - limits.maxBytes)));
            truncated = true;
            req.destroy();
            resolve({ status, headers: res.headers, body: Buffer.concat(chunks), truncated });
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => !truncated && resolve({ status, headers: res.headers, body: Buffer.concat(chunks), truncated }));
        stream.on("error", () => !truncated && reject(new ScanError("The page content could not be decoded.")));
      },
    );
    req.on("timeout", () => req.destroy(new ScanError(`The page did not respond within ${limits.timeoutMs / 1000} s.`)));
    req.on("error", (err) => {
      if (err instanceof ScanError) return reject(err);
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ECONNREFUSED") reject(new ScanError("The server refused the connection."));
      else if (code === "ENOTFOUND" || code === "EAI_AGAIN") reject(new ScanError("The host name could not be resolved."));
      else if (code === "CERT_HAS_EXPIRED" || code?.startsWith("ERR_TLS") || code?.includes("CERT")) reject(new ScanError("The site's TLS certificate is invalid."));
      else if (code === "ECONNRESET") reject(new ScanError("The connection was reset by the server."));
      else reject(new ScanError("The page could not be fetched."));
    });
    req.end();
  });
}

/** Fetches one HTML page with SSRF protection, redirect re-validation, size and time limits. */
export async function safeFetchHtml(input: string, options: FetchOptions = {}): Promise<FetchedPage> {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const opts = { resolve: options.resolve ?? defaultResolve, isAllowedAddress: options.isAllowedAddress ?? isPublicAddress };
  const started = Date.now();
  const deadline = started + limits.timeoutMs;
  const redirects: string[] = [];
  let url = checkUrl(input, { allowedPorts: options.allowedPorts });

  for (;;) {
    const res = await requestOnce(url, opts, limits, deadline);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.location;
      if (!location) throw new ScanError(`The page redirected (HTTP ${res.status}) without a destination.`);
      if (redirects.length >= limits.maxRedirects) throw new ScanError(`Too many redirects (more than ${limits.maxRedirects}).`);
      url = checkUrl(new URL(location, url), { allowedPorts: options.allowedPorts });
      redirects.push(url.toString());
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new ScanError(`The page returned HTTP ${res.status}; nothing was analyzed.`);
    const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
    if (!/text\/html|application\/xhtml\+xml/.test(contentType)) {
      throw new ScanError(`The address returned "${contentType.split(";")[0] || "unknown content"}", not an HTML page. Upload files such as PDFs or CSVs instead.`);
    }
    return { finalUrl: url.toString(), status: res.status, contentType, body: res.body, truncated: res.truncated, redirects, durationMs: Date.now() - started };
  }
}

/** Decodes the body using the declared charset (header or <meta>), falling back to UTF-8. */
export function decodeHtml(body: Buffer, contentType: string): string {
  const fromHeader = contentType.match(/charset=([\w-]+)/i)?.[1];
  const fromMeta = body.subarray(0, 2048).toString("latin1").match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  const charset = (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

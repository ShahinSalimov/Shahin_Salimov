import { isIP } from "node:net";
import { ScanError } from "./errors";

/**
 * SSRF protection. A scan may only reach public internet addresses on the
 * standard web ports. Checked twice: on the URL (shape and IP literals) and on
 * every resolved address at connection time (see safe-fetch.ts), so DNS
 * rebinding and redirects to internal hosts are blocked too.
 */

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function inV4Range(ip: number, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (ipv4ToInt(base) & mask);
}

function isPublicV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return !V4_BLOCKED.some(([base, bits]) => inV4Range(n, base, bits));
}

/** Expands an IPv6 address into 8 16-bit groups. Returns null if malformed. */
function expandV6(ip: string): number[] | null {
  let addr = ip.split("%")[0]!.toLowerCase();
  // Embedded dotted IPv4 ("::ffff:127.0.0.1") → two hex groups ("::ffff:7f00:1").
  const v4 = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = ipv4ToInt(v4[1]!);
    addr = `${addr.slice(0, -v4[1]!.length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const parts = addr.split("::");
  if (parts.length > 2) return null;
  const parse = (x: string | undefined) => (x ? x.split(":").map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : Number.NaN)) : []);
  const a = parse(parts[0]);
  const b = parse(parts[1]);
  if ([...a, ...b].some(Number.isNaN)) return null;
  if (parts.length === 2) {
    const zeros = 8 - a.length - b.length;
    return zeros >= 1 ? [...a, ...Array<number>(zeros).fill(0), ...b] : null;
  }
  return a.length === 8 ? a : null;
}

function isPublicV6(ip: string): boolean {
  const g = expandV6(ip);
  if (!g) return false;
  const [g0, , , , , g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
  if (g.every((x) => x === 0)) return false; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g7 === 1) return false; // ::1
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible / NAT64 (64:ff9b::a.b.c.d): check the embedded IPv4.
  const embedded = `${g6 >>> 8}.${g6 & 0xff}.${g7 >>> 8}.${g7 & 0xff}`;
  if (g.slice(0, 5).every((x) => x === 0) && g5 === 0xffff) return isPublicV4(embedded);
  if (g0 === 0x64 && g[1] === 0xff9b) return isPublicV4(embedded);
  if (g.slice(0, 6).every((x) => x === 0)) return false; // deprecated IPv4-compatible
  if ((g0 & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((g0 & 0xffc0) === 0xfec0) return false; // fec0::/10 site-local (deprecated)
  if ((g0 & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  if (g0 === 0x2001 && g[1] === 0x0db8) return false; // 2001:db8::/32 documentation
  if (g0 === 0x2002) return isPublicV4(`${g[1]! >>> 8}.${g[1]! & 0xff}.${g[2]! >>> 8}.${g[2]! & 0xff}`); // 6to4
  return true;
}

export function isPublicAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPublicV4(ip);
  if (v === 6) return isPublicV6(ip);
  return false;
}

const BLOCKED_HOST = /(^|\.)(localhost|localdomain|local|internal|intranet|lan|home|corp|arpa)$/i;
const ALLOWED_PORTS = new Set(["", "80", "443"]);

/** Validates the shape of a URL before any network activity. Throws ScanError. */
export function checkUrl(input: string | URL, opts: { allowedPorts?: ReadonlySet<string> } = {}): URL {
  let url: URL;
  try {
    url = typeof input === "string" ? new URL(input) : input;
  } catch {
    throw new ScanError("The address is not a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ScanError("Only http and https addresses can be scanned.");
  if (url.username || url.password) throw new ScanError("Addresses with embedded credentials are not allowed.");
  if (!(opts.allowedPorts ?? ALLOWED_PORTS).has(url.port)) throw new ScanError("Only the standard web ports (80 and 443) can be scanned.");
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) throw new ScanError("The address has no host name.");
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new ScanError("This address points to a private or internal network and cannot be scanned.");
  } else {
    if (BLOCKED_HOST.test(host) || !host.includes(".")) throw new ScanError("This host name is internal and cannot be scanned.");
    // Numeric hosts like "2130706433" or "0x7f000001" are parsed by URL into IPs already; reject leftovers.
    if (/^[\d.x]+$/i.test(host)) throw new ScanError("This address is not a public host name.");
  }
  return url;
}

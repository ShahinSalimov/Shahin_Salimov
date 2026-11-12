import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { safeFetchHtml, decodeHtml } = await import("@/server/intelligence/safe-fetch");

let server: http.Server;
let port: string;

/**
 * A real local HTTP server. "public.test" is resolved to 127.0.0.1 and allowed
 * by the test policy; "evil.test" resolves to 127.0.0.1 but the policy treats
 * it like an internal address, simulating DNS rebinding / internal targets.
 */
const resolve = async (host: string) => {
  if (host === "public.test" || host === "evil.test") return [{ address: "127.0.0.1", family: 4 }];
  if (host === "mixed.test") return [{ address: "127.0.0.1", family: 4 }, { address: "10.0.0.5", family: 4 }];
  throw new Error("ENOTFOUND");
};
let allowLoopback = true;
const isAllowedAddress = (ip: string) => allowLoopback && ip === "127.0.0.1";
const opts = () => ({ resolve, isAllowedAddress, allowedPorts: new Set([port, ""]), limits: { timeoutMs: 1500, maxBytes: 64 * 1024, maxRedirects: 2 } });
const url = (host: string, path: string) => `http://${host}:${port}${path}`;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const p = req.url ?? "/";
    if (p === "/page") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<html><title>Menu</title><body><p>Burger $15</p></body></html>");
    } else if (p === "/gzip") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      res.end(zlib.gzipSync("<html><body>Compressed $9</body></html>"));
    } else if (p === "/bomb") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      res.end(zlib.gzipSync(Buffer.alloc(5 * 1024 * 1024, "a"))); // ~5 KB compressed, 5 MB decompressed
    } else if (p === "/big") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("x".repeat(200 * 1024));
    } else if (p === "/redirect") {
      res.writeHead(302, { location: "/page" });
      res.end();
    } else if (p === "/redirect-internal") {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      res.end();
    } else if (p === "/redirect-loop") {
      res.writeHead(302, { location: "/redirect-loop" });
      res.end();
    } else if (p === "/json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    } else if (p === "/missing") {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("nope");
    } else if (p === "/slow") {
      setTimeout(() => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("late");
      }, 3000);
    } else {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = String((server.address() as AddressInfo).port);
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe("safeFetchHtml", () => {
  it("fetches an HTML page", async () => {
    const r = await safeFetchHtml(url("public.test", "/page"), opts());
    expect(r.status).toBe(200);
    expect(decodeHtml(r.body, r.contentType)).toContain("Burger $15");
    expect(r.truncated).toBe(false);
  });

  it("decompresses gzip", async () => {
    const r = await safeFetchHtml(url("public.test", "/gzip"), opts());
    expect(r.body.toString()).toContain("Compressed $9");
  });

  it("limits decompressed size (compression bombs)", async () => {
    const r = await safeFetchHtml(url("public.test", "/bomb"), opts());
    expect(r.truncated).toBe(true);
    expect(r.body.length).toBe(64 * 1024);
  });

  it("truncates large pages", async () => {
    const r = await safeFetchHtml(url("public.test", "/big"), opts());
    expect(r.truncated).toBe(true);
    expect(r.body.length).toBe(64 * 1024);
  });

  it("follows redirects and re-validates each hop", async () => {
    const r = await safeFetchHtml(url("public.test", "/redirect"), opts());
    expect(r.redirects).toEqual([url("public.test", "/page")]);
    await expect(safeFetchHtml(url("public.test", "/redirect-internal"), opts())).rejects.toThrow(/private or internal/);
    await expect(safeFetchHtml(url("public.test", "/redirect-loop"), opts())).rejects.toThrow(/Too many redirects/);
  });

  it("blocks hosts that resolve to disallowed addresses at connection time", async () => {
    allowLoopback = false;
    try {
      await expect(safeFetchHtml(url("evil.test", "/page"), opts())).rejects.toThrow(/private or internal network/);
    } finally {
      allowLoopback = true;
    }
  });

  it("blocks hosts where any resolved address is internal", async () => {
    await expect(safeFetchHtml(url("mixed.test", "/page"), opts())).rejects.toThrow(/private or internal network/);
  });

  it("reports HTTP errors, non-HTML content, timeouts and DNS failures honestly", async () => {
    await expect(safeFetchHtml(url("public.test", "/missing"), opts())).rejects.toThrow(/HTTP 404/);
    await expect(safeFetchHtml(url("public.test", "/json"), opts())).rejects.toThrow(/not an HTML page/);
    await expect(safeFetchHtml(url("public.test", "/slow"), opts())).rejects.toThrow(/did not respond within 1.5 s/);
    await expect(safeFetchHtml(url("nowhere.test", "/page"), opts())).rejects.toThrow(/could not be resolved/);
  });

  it("uses the strict default policy when nothing is injected", async () => {
    await expect(safeFetchHtml(`http://127.0.0.1:${port}/page`, { allowedPorts: new Set([port]) })).rejects.toThrow(/private or internal/);
  });
});

describe("decodeHtml", () => {
  it("uses the declared charset", () => {
    const latin1 = Buffer.from([0x43, 0x61, 0x66, 0xe9]); // "Café" in windows-1252
    expect(decodeHtml(latin1, "text/html; charset=windows-1252")).toBe("Café");
    expect(decodeHtml(Buffer.from('<meta charset="iso-8859-1">\xe9', "latin1"), "text/html")).toContain("é");
  });
});

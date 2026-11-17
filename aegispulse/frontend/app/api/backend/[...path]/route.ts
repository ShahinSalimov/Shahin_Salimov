/**
 * Server-side proxy from the dashboard to the FastAPI backend.
 *
 * - The backend API key never reaches the browser: it is injected here from
 *   the server-only AEGIS_API_KEY environment variable.
 * - Only an allowlist of API path prefixes and methods is forwarded.
 * - Response bodies are streamed, so Server-Sent Events (/stream) and file
 *   downloads (STIX / CEF) pass straight through.
 */
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");
const API_KEY = process.env.AEGIS_API_KEY ?? "";
const MAX_BODY_BYTES = 64 * 1024;

const ALLOWED_PREFIXES = ["telemetry", "stream", "companies", "threats", "patches", "alerts", "simulate-attack", "collectors"];
const PASSTHROUGH_RESPONSE_HEADERS = ["content-type", "content-disposition", "cache-control", "retry-after"];

type Ctx = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params;
  const segments = path ?? [];
  if (
    segments.length === 0 ||
    !ALLOWED_PREFIXES.includes(segments[0] ?? "") ||
    segments.some((s) => s === ".." || s.includes("/") || s.includes("\\"))
  ) {
    return Response.json({ detail: "Not found" }, { status: 404 });
  }

  const target = `${BACKEND_URL}/api/${segments.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers = new Headers({ Accept: req.headers.get("accept") ?? "application/json" });
  if (API_KEY) headers.set("X-API-Key", API_KEY);

  let body: string | undefined;
  if (req.method !== "GET") {
    body = await req.text();
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
      return Response.json({ detail: "Request body too large" }, { status: 413 });
    }
    headers.set("Content-Type", "application/json");
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
      signal: req.signal,
    });
  } catch {
    return Response.json({ detail: "Backend unreachable. Is the AegisPulse API running?" }, { status: 502 });
  }

  const outHeaders = new Headers();
  for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) outHeaders.set(name, value);
  }
  if (segments[0] === "stream") {
    outHeaders.set("Cache-Control", "no-cache, no-transform");
    outHeaders.set("X-Accel-Buffering", "no");
  }
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;

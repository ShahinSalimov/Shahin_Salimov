/**
 * Exchanges email + password for a backend session token and stores it in an
 * httpOnly, SameSite=Strict cookie. The token is never exposed to page JavaScript.
 */
import { NextResponse, type NextRequest } from "next/server";

import { backendUrl, isHttps, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ detail: "Invalid request" }, { status: 400 });
  }
  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ detail: "Email and password are required" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${backendUrl()}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Rate limiting is per client IP on the backend; pass the real caller.
        "X-Forwarded-For": req.headers.get("x-forwarded-for") ?? "",
      },
      body: JSON.stringify({ email: body.email, password: body.password }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ detail: "Authentication service unreachable" }, { status: 502 });
  }

  const data = (await upstream.json().catch(() => ({}))) as { token?: string; expires_at?: number; user?: unknown; detail?: unknown };
  if (!upstream.ok || !data.token || !data.expires_at) {
    return NextResponse.json({ detail: data.detail ?? "Login failed" }, { status: upstream.status === 200 ? 502 : upstream.status });
  }

  const res = NextResponse.json({ user: data.user });
  res.cookies.set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    sameSite: "strict",
    secure: isHttps(req),
    path: "/",
    expires: new Date(data.expires_at * 1000),
  });
  return res;
}

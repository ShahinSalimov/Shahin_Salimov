import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/server/auth/session";
import { DEMO_WORKSPACE_ID } from "@/server/demo/fixture";
import { isDemoModeEnabled } from "@/server/env.server";
import { clientIp, takeToken } from "@/server/rate-limit";

/** Starts a demo session (fictional data only). Disabled unless CHANGEMESH_DEMO_MODE=enabled. */
export async function POST(request: NextRequest) {
  if (!isDemoModeEnabled()) return NextResponse.json({ error: "Demo mode is disabled." }, { status: 404 });
  // Each demo session holds an in-memory copy of the sample data; cap how fast one client can create them.
  if (!takeToken(`demo:${clientIp(request.headers)}`, 30, 10 * 60_000).ok) {
    return NextResponse.json({ error: "Too many demo sessions from this address. Please wait a few minutes." }, { status: 429 });
  }
  const response = NextResponse.redirect(new URL(`/w/${DEMO_WORKSPACE_ID}`, request.nextUrl.origin), { status: 303 });
  response.cookies.set(DEMO_COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}

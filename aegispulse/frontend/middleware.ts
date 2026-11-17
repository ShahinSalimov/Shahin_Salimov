/**
 * Route protection: pages require a session cookie (otherwise redirect to
 * /login); the backend proxy answers 401 instead of redirecting. Token
 * validity itself is checked by the backend on every request.
 */
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    return hasSession ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }
  if (hasSession) return NextResponse.next();
  if (pathname.startsWith("/api/backend")) {
    return NextResponse.json({ detail: "Not signed in" }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + req.nextUrl.search);
  else if (req.nextUrl.search) login.searchParams.set("next", "/" + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except static assets and the auth endpoints.
  matcher: ["/((?!_next/|favicon.svg|api/auth/).*)"],
};

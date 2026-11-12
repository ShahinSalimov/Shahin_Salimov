import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/app", "/w/", "/onboarding"];

/**
 * Runs before every matched request:
 * 1. Assigns a request id (x-request-id) used in logs.
 * 2. Refreshes the Supabase session cookie.
 * 3. Sends unauthenticated visitors of protected routes to /login.
 *    (Demo sessions are validated again on the server; this is only a fast path.)
 */
export async function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  request.headers.set("x-request-id", requestId);

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let signedIn = false;

  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  }

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p));
  const hasDemo = Boolean(request.cookies.get("cm_demo")?.value);
  if (isProtected && !signedIn && !hasDemo) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    response = NextResponse.redirect(login);
  }

  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};

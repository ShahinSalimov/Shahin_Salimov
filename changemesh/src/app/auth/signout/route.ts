import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createUserClient } from "@/server/supabase/clients";
import { DEMO_COOKIE } from "@/server/auth/session";

/** POST only, so a cross-site <img> or link prefetch cannot sign users out. */
export async function POST(request: NextRequest) {
  if (isSupabaseConfigured()) {
    const supabase = await createUserClient();
    await supabase.auth.signOut();
  }
  const response = NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
  response.cookies.delete(DEMO_COOKIE);
  return response;
}

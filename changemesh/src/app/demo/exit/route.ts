import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/server/auth/session";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.nextUrl.origin), { status: 303 });
  response.cookies.delete(DEMO_COOKIE);
  return response;
}

import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { isDemoModeEnabled } from "@/server/env.server";

export const dynamic = "force-dynamic";

/** Liveness + configuration flags. Never returns secret values. */
export function GET() {
  return NextResponse.json({
    status: "ok",
    authConfigured: isSupabaseConfigured(),
    demoMode: isDemoModeEnabled(),
    time: new Date().toISOString(),
  });
}

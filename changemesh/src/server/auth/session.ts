import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isDemoModeEnabled } from "../env.server";
import { createUserClient } from "../supabase/clients";

export const DEMO_COOKIE = "cm_demo";

export type Viewer =
  | { kind: "user"; id: string; email: string; fullName: string | null }
  | { kind: "demo" };

/**
 * Resolves who is making the request.
 * - A real Supabase session always wins.
 * - The demo cookie only grants access to fictional demo data, and only when
 *   CHANGEMESH_DEMO_MODE=enabled. It is never treated as a real user.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createUserClient();
      const { data, error } = await supabase.auth.getUser();
      if (data.user && !error) {
        const meta = data.user.user_metadata as { full_name?: unknown } | undefined;
        return {
          kind: "user",
          id: data.user.id,
          email: data.user.email ?? "",
          fullName: typeof meta?.full_name === "string" ? meta.full_name : null,
        };
      }
    } catch (error) {
      logger.error("auth.get_user_failed", { error });
    }
  }
  if (isDemoModeEnabled()) {
    const store = await cookies();
    if (store.get(DEMO_COOKIE)?.value === "1") return { kind: "demo" };
  }
  return null;
});

export async function requireViewer(next?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return viewer;
}

export async function requireUser(next?: string): Promise<Extract<Viewer, { kind: "user" }>> {
  const viewer = await requireViewer(next);
  if (viewer.kind !== "user") redirect("/signup?from=demo");
  return viewer;
}

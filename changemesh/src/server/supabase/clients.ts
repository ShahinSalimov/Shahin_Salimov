import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";
import { notConfigured } from "@/lib/errors";
import { requireServiceRoleKey } from "../env.server";

function requirePublicSupabase() {
  const env = getPublicEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw notConfigured("Authentication is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

/**
 * Per-request client acting as the signed-in user. Every query is subject to
 * Row Level Security, so this is the default client for all data access.
 */
export async function createUserClient(): Promise<SupabaseClient> {
  const { url, anonKey } = requirePublicSupabase();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Service-role client. BYPASSES RLS. Only for trusted server-side jobs
 * (billing webhooks, scan workers, invitation acceptance). Never return its
 * data to a user without an explicit authorization check.
 */
export function createServiceClient(): SupabaseClient {
  const { url } = requirePublicSupabase();
  return createClient(url, requireServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

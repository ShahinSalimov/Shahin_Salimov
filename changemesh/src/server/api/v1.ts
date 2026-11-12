import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ZodError } from "zod";
import type { ApiScope } from "@/domain/commercial/inputs";
import { AppError, fromPostgresError, toPublicError } from "@/lib/errors";
import { isSupabaseConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { looksLikeApiKey, sha256Hex } from "../commercial/tokens";
import { clientIp, takeToken } from "../rate-limit";
import { createServiceClient } from "../supabase/clients";

export interface ApiCaller {
  keyId: string;
  workspaceId: string;
  organizationId: string;
  scopes: ApiScope[];
  /** Service-role client. EVERY query must filter by caller.workspaceId. */
  db: SupabaseClient;
}

const RATE_LIMIT = 120; // requests per key per minute (per server instance)

export function apiError(status: number, code: string, message: string, headers?: HeadersInit) {
  return Response.json({ error: { code, message } }, { status, headers });
}

/**
 * Authenticates `Authorization: Bearer cm_…` against hashed API keys.
 * Keys are bound to one workspace; RLS is bypassed, so tenant isolation is
 * enforced by filtering every query on caller.workspaceId (see API_DOCUMENTATION.md).
 */
export async function authenticate(request: Request, scope: ApiScope): Promise<ApiCaller | Response> {
  if (!isSupabaseConfigured()) return apiError(503, "NOT_CONFIGURED", "The API requires a configured database.");
  const header = request.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  // Per-address limit first, so unauthenticated floods cannot reach the key lookup.
  const byIp = takeToken(`api-ip:${clientIp(request.headers)}`, RATE_LIMIT * 3, 60_000);
  if (!byIp.ok) return apiError(429, "RATE_LIMITED", "Rate limit exceeded.", { "retry-after": String(Math.ceil(byIp.retryAfterMs / 1000)) });
  if (!looksLikeApiKey(key)) return apiError(401, "UNAUTHENTICATED", "Send a valid API key as 'Authorization: Bearer cm_…'.");
  const keyHash = sha256Hex(key);
  // Keyed by the full key's hash: the public prefix alone cannot exhaust another key's quota.
  const limited = takeToken(`api:${keyHash}`, RATE_LIMIT, 60_000);
  if (!limited.ok) return apiError(429, "RATE_LIMITED", "Rate limit exceeded.", { "retry-after": String(Math.ceil(limited.retryAfterMs / 1000)) });

  let db: SupabaseClient;
  try {
    db = createServiceClient();
  } catch {
    return apiError(503, "NOT_CONFIGURED", "The API is not configured on this server.");
  }
  const { data, error } = await db
    .from("api_keys")
    .select("id, workspace_id, scopes, expires_at, revoked_at, last_used_at, workspaces!inner(organization_id)")
    .eq("key_hash", keyHash)
    .maybeSingle<{ id: string; workspace_id: string; scopes: ApiScope[]; expires_at: string | null; revoked_at: string | null; last_used_at: string | null; workspaces: { organization_id: string } }>();
  if (error) {
    logger.error("api.key_lookup_failed", { code: error.code });
    return apiError(500, "INTERNAL", "Something went wrong.");
  }
  if (!data || data.revoked_at || (data.expires_at && new Date(data.expires_at).getTime() < Date.now())) {
    return apiError(401, "UNAUTHENTICATED", "The API key is invalid, revoked or expired.");
  }
  if (!data.scopes.includes(scope)) return apiError(403, "FORBIDDEN", `This key does not have the '${scope}' scope.`);
  // Record usage at most once a minute per key.
  if (!data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > 60_000) {
    void db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(({ error: e }) => e && logger.warn("api.last_used_failed", { code: e.code }));
  }
  return { keyId: data.id, workspaceId: data.workspace_id, organizationId: data.workspaces.organization_id, scopes: data.scopes, db };
}

export function pagination(url: URL): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
  return { limit, offset };
}

/** Runs a handler and converts thrown errors into JSON responses without leaking internals. */
export async function handle(name: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof SyntaxError) return apiError(400, "VALIDATION_FAILED", "The request body must be valid JSON.");
    const mapped = !(error instanceof AppError) && !(error instanceof ZodError) && typeof error === "object" && error && "code" in error ? fromPostgresError(error as { code?: string; message?: string }) : null;
    const effective = mapped ?? error;
    const pub = toPublicError(effective);
    const status = effective instanceof AppError ? effective.status : effective instanceof ZodError ? 422 : 500;
    if (status >= 500) logger.error("api.failed", { name, error });
    return Response.json({ error: pub }, { status });
  }
}

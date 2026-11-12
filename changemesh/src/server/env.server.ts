import "server-only";
import { z } from "zod";

/**
 * Server-only environment. Importing this file from a Client Component fails the
 * build ("server-only"), which keeps SUPABASE_SERVICE_ROLE_KEY out of the browser.
 */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
  CHANGEMESH_DEMO_MODE: z.enum(["enabled", "disabled"]).default("disabled"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment variables: ${fields}`);
  }
  return parsed.data;
}

let cached: ServerEnv | undefined;
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

export function isDemoModeEnabled(): boolean {
  return getServerEnv().CHANGEMESH_DEMO_MODE === "enabled";
}

/** Returns the service-role key or throws. Never pass the result to client code. */
export function requireServiceRoleKey(): string {
  const key = getServerEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return key;
}

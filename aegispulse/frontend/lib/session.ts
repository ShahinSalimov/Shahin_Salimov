// Server-side session cookie helpers (used by middleware and route handlers).

export const SESSION_COOKIE = "aegis_session";

export function backendUrl(): string {
  return (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");
}

/** Secure cookies only when the browser reached us over HTTPS (directly or via a TLS proxy). */
export function isHttps(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]?.trim() === "https";
  return new URL(req.url).protocol === "https:";
}

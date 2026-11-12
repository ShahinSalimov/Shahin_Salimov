import "server-only";

/**
 * Fixed-window in-memory rate limiter. Per server instance only — it protects
 * against bursts from one user, not against distributed abuse (a shared store
 * such as Redis is needed for that; see DEVELOPMENT_STATUS.md).
 */
const windows = new Map<string, { start: number; count: number }>();

export function takeToken(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterMs: number } {
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 10_000) windows.delete(windows.keys().next().value!);
    return { ok: true, retryAfterMs: 0 };
  }
  if (w.count >= limit) return { ok: false, retryAfterMs: windowMs - (now - w.start) };
  w.count++;
  return { ok: true, retryAfterMs: 0 };
}

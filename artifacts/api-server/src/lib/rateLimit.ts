import type { RequestHandler } from 'express';
import { HttpError } from './http';

/** Small fixed-window limiter (per process). Good enough for login/register abuse; use a shared store if you scale out. */
export function rateLimit(opts: { windowMs: number; max: number; key: string }): RequestHandler {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req, _res, next) => {
    const now = Date.now();
    const k = `${opts.key}:${req.ip}`;
    const h = hits.get(k);
    if (!h || h.reset < now) hits.set(k, { count: 1, reset: now + opts.windowMs });
    else if (++h.count > opts.max) return next(new HttpError(429, 'rate_limited'));
    if (hits.size > 10_000) for (const [key, v] of hits) if (v.reset < now) hits.delete(key);
    next();
  };
}

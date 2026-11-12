import "server-only";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { AppError, toPublicError, type ActionResult } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function requestId(): Promise<string> {
  const h = await headers();
  return h.get("x-request-id") ?? crypto.randomUUID();
}

/**
 * Wraps a Server Action body: logs failures with a request id and converts any
 * error into a safe, serializable ActionResult. Redirects pass through.
 */
export async function runAction<T>(name: string, body: () => Promise<T>): Promise<ActionResult<T>> {
  const rid = await requestId();
  const log = logger.child({ action: name, requestId: rid });
  try {
    return { ok: true, data: await body() };
  } catch (error) {
    unstable_rethrow(error); // let redirect()/notFound() propagate
    const pub = toPublicError(error);
    if (error instanceof AppError && error.status < 500) log.warn("action.rejected", { code: pub.code });
    else if (pub.code !== "VALIDATION_FAILED") log.error("action.failed", { error });
    return { ok: false, error: pub };
  }
}

export function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

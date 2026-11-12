import { ZodError } from "zod";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "NOT_CONFIGURED"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  NOT_CONFIGURED: 503,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** An error whose message is safe to show to the user. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown; fieldErrors?: Record<string, string[]> }) {
    super(message, { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.fieldErrors = options?.fieldErrors;
  }
}

export const unauthenticated = (msg = "Please sign in to continue.") => new AppError("UNAUTHENTICATED", msg);
export const forbidden = (msg = "You do not have permission to perform this action.") => new AppError("FORBIDDEN", msg);
export const notFound = (msg = "The requested resource was not found.") => new AppError("NOT_FOUND", msg);
export const conflict = (msg: string) => new AppError("CONFLICT", msg);
export const notConfigured = (msg: string) => new AppError("NOT_CONFIGURED", msg);

export interface PublicError {
  code: ErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

/** Converts any thrown value into a message that is safe to send to the browser. */
export function toPublicError(error: unknown): PublicError {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, fieldErrors: error.fieldErrors };
  }
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { code: "VALIDATION_FAILED", message: "Please check the highlighted fields.", fieldErrors };
  }
  return { code: "INTERNAL", message: "Something went wrong. Please try again." };
}

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: PublicError };

/** Postgres error codes we map to user-facing errors. */
export function fromPostgresError(err: { code?: string; message?: string } | null | undefined): AppError | null {
  if (!err) return null;
  switch (err.code) {
    case "23505":
      return conflict("A record with these details already exists.");
    case "42501":
      return forbidden();
    case "23503":
      return new AppError("VALIDATION_FAILED", "A referenced record does not exist.");
    case "23514":
      return new AppError("VALIDATION_FAILED", "The provided values are not allowed.");
    case "P0001":
      return new AppError("VALIDATION_FAILED", err.message ?? "The operation was rejected.");
    default:
      return null;
  }
}

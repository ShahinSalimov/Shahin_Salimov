import { z } from "zod";
import { describe, expect, it } from "vitest";
import { AppError, forbidden, fromPostgresError, toPublicError } from "./errors";

describe("toPublicError", () => {
  it("passes through AppError messages", () => {
    expect(toPublicError(forbidden())).toEqual({ code: "FORBIDDEN", message: "You do not have permission to perform this action.", fieldErrors: undefined });
  });

  it("maps Zod errors to field errors", () => {
    const result = z.object({ email: z.string().email("bad email") }).safeParse({ email: "x" });
    const pub = toPublicError(result.error);
    expect(pub.code).toBe("VALIDATION_FAILED");
    expect(pub.fieldErrors).toEqual({ email: ["bad email"] });
  });

  it("hides details of unexpected errors", () => {
    const pub = toPublicError(new Error("connection string postgres://user:secret@host"));
    expect(pub).toEqual({ code: "INTERNAL", message: "Something went wrong. Please try again." });
  });
});

describe("fromPostgresError", () => {
  it("maps common SQLSTATE codes", () => {
    expect(fromPostgresError({ code: "23505" })?.code).toBe("CONFLICT");
    expect(fromPostgresError({ code: "42501" })?.code).toBe("FORBIDDEN");
    expect(fromPostgresError({ code: "P0001", message: "A workspace must have at least one owner" })?.message).toMatch(/owner/);
    expect(fromPostgresError({ code: "XX000" })).toBeNull();
    expect(fromPostgresError(null)).toBeNull();
  });

  it("produces correct HTTP statuses", () => {
    expect(new AppError("NOT_CONFIGURED", "x").status).toBe(503);
  });
});

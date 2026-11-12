import { describe, expect, it } from "vitest";
import { passwordSchema, safeNextPath, signUpSchema } from "./schemas";

describe("safeNextPath", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeNextPath("/w/abc?tab=assets")).toBe("/w/abc?tab=assets");
  });
  it("rejects open-redirect attempts", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "evil.com", "/ok\r\nSet-Cookie: x"]) {
      expect(safeNextPath(bad)).toBe("/app");
    }
  });
  it("falls back when empty", () => {
    expect(safeNextPath(null)).toBe("/app");
    expect(safeNextPath(undefined, "/onboarding")).toBe("/onboarding");
  });
});

describe("passwordSchema", () => {
  it("requires length, letters and digits", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("onlyletterslong").success).toBe(false);
    expect(passwordSchema.safeParse("1234567890").success).toBe(false);
    expect(passwordSchema.safeParse("correct-horse-42").success).toBe(true);
  });
});

describe("signUpSchema", () => {
  it("normalizes email", () => {
    const r = signUpSchema.parse({ fullName: "Ada Lovelace", email: "  Ada@Example.COM ", password: "analytical-engine-1" });
    expect(r.email).toBe("ada@example.com");
  });
});

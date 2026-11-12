import { describe, expect, it } from "vitest";
import { slugify, SLUG_PATTERN } from "./slug";
import { createOrganizationSchema } from "./schemas";

describe("slugify", () => {
  it("creates URL-safe slugs", () => {
    expect(slugify("Harbor & Vine Restaurants")).toBe("harbor-vine-restaurants");
    expect(slugify("  Çay Evi Şəki ")).toBe("cay-evi-seki");
    expect(slugify("İstanbul Döner")).toBe("istanbul-doner");
  });

  it("always returns a slug matching the pattern", () => {
    for (const input of ["", "!", "a", "x".repeat(200), "---Hello---", "Ünlü Ağ"]) {
      expect(slugify(input)).toMatch(SLUG_PATTERN);
    }
  });
});

describe("createOrganizationSchema", () => {
  it("trims and validates names", () => {
    expect(createOrganizationSchema.parse({ organizationName: "  Acme  ", workspaceName: "Main" })).toEqual({
      organizationName: "Acme",
      workspaceName: "Main",
    });
    expect(createOrganizationSchema.safeParse({ organizationName: "A", workspaceName: "Main" }).success).toBe(false);
  });
});

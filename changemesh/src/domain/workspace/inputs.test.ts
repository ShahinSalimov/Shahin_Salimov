import { describe, expect, it } from "vitest";
import { createAssetSchema, createChangeSchema, decisionSchema } from "./inputs";

describe("createAssetSchema", () => {
  it("requires a URL for websites", () => {
    const r = createAssetSchema.safeParse({ type: "website", name: "Menu" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["sourceUrl"]);
  });
  it("accepts manual records without URL and normalizes empty strings", () => {
    expect(createAssetSchema.parse({ type: "manual", name: " Downtown ", description: "", sourceUrl: "" })).toEqual({
      type: "manual",
      name: "Downtown",
      description: null,
      sourceUrl: null,
    });
  });
  it("rejects non-http schemes and embedded credentials", () => {
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "ftp://x.test", "https://user:pass@x.test", "not a url"]) {
      expect(createAssetSchema.safeParse({ type: "website", name: "x", sourceUrl: url }).success, url).toBe(false);
    }
  });
  it("rejects unknown asset types", () => {
    expect(createAssetSchema.safeParse({ type: "spreadsheet", name: "x" }).success).toBe(false);
  });
});

describe("decisionSchema", () => {
  it("requires a comment for rejections and revisions, not approvals", () => {
    expect(decisionSchema.safeParse({ proposalId: "p", decision: "approved" }).success).toBe(true);
    expect(decisionSchema.safeParse({ proposalId: "p", decision: "rejected", comment: " " }).success).toBe(false);
    expect(decisionSchema.safeParse({ proposalId: "p", decision: "needs_revision", comment: "Fix wording" }).success).toBe(true);
  });
});

describe("createChangeSchema", () => {
  it("validates change types", () => {
    expect(createChangeSchema.safeParse({ title: "Price", type: "updated" }).success).toBe(true);
    expect(createChangeSchema.safeParse({ title: "Price", type: "modified" }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { getPlan, PLANS, usageRatio } from "./plans";

describe("plans", () => {
  it("matches the brief's test prices and limits", () => {
    expect(PLANS.map((p) => [p.id, p.priceMonthlyUsd, p.limits.assets])).toEqual([
      ["starter", 19, 25],
      ["business", 59, 250],
      ["agency", 149, 1000],
      ["enterprise", null, null],
    ]);
    expect(getPlan("business").limits.workspaces).toBe(5);
  });
  it("computes usage ratios", () => {
    expect(usageRatio(15, 25)).toBe(0.6);
    expect(usageRatio(30, 25)).toBe(1);
    expect(usageRatio(5, null)).toBeNull();
  });
});

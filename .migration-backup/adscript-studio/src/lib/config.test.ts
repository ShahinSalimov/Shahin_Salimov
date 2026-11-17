import { describe, expect, it } from "vitest";
import { parseCreditPacks } from "./config";

describe("parseCreditPacks", () => {
  it("returns [] when unset", () => {
    expect(parseCreditPacks(undefined)).toEqual([]);
    expect(parseCreditPacks("  ")).toEqual([]);
  });

  it("parses valid packs", () => {
    const raw = JSON.stringify([{ productId: "p1", name: "Starter", credits: 20, price: "$5", url: "https://a.gumroad.com/l/x" }]);
    expect(parseCreditPacks(raw)[0].credits).toBe(20);
  });

  it("throws on invalid JSON or invalid pack", () => {
    expect(() => parseCreditPacks("{")).toThrow(/valid JSON/);
    expect(() => parseCreditPacks(JSON.stringify([{ productId: "p1", credits: -1 }]))).toThrow();
  });
});

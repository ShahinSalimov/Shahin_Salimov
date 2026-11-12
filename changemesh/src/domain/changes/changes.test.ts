import { describe, expect, it } from "vitest";
import type { Asset, AssetRelationship, ExtractedFact } from "../workspace/model";
import { changeTitle, diffFacts } from "./detect";
import { analyzeImpact, scoreToLevel, summarizeReport } from "./impact";
import { findInconsistencies } from "./inconsistency";
import { buildProposals } from "./proposals";

const asset = (id: string, type: Asset["type"], over: Partial<Asset> = {}) => ({ id, type, name: id, status: "active", isCustomerFacing: true, scanStatus: "succeeded", ...over }) as Asset;
let n = 0;
const fact = (assetId: string, entity: string, attribute: string, value: string, over: Partial<ExtractedFact> = {}) =>
  ({ id: `f${++n}`, assetId, entityName: entity, attributeName: attribute, valueText: value, normalizedValue: value.replace("$", "USD ").replace(/(\d+)$/, "$1.00").toLowerCase(), confidence: 0.9, method: "csv", assetVersion: 1, location: { kind: "row", row: 2, column: "Price" }, ...over }) as ExtractedFact;
const rel = (s: string, t: string, type: AssetRelationship["type"] = "derived_from", status: AssetRelationship["status"] = "confirmed", confidence = 1) =>
  ({ id: `${s}>${t}`, sourceAssetId: s, targetAssetId: t, type, status, confidence, origin: "manual", note: null, createdAt: "" }) as AssetRelationship;
const nf = (assetId: string, entity: string, attribute: string, value: string, normalized: string, over: Partial<ExtractedFact> = {}) => fact(assetId, entity, attribute, value, { normalizedValue: normalized, ...over });

describe("diffFacts", () => {
  const v1 = [nf("a", "Classic Burger", "Price", "$12.00", "USD 12.00"), nf("a", "Truffle Fries", "price", "$8.50", "USD 8.50"), nf("a", "Menu", "page title", "Menu", "menu")];
  const v2 = [nf("a", "classic burger", "price", "$15.00", "USD 15.00"), nf("a", "Pumpkin Risotto", "price", "$19.00", "USD 19.00"), nf("a", "Menu", "page title", "Menu 2026", "menu 2026")];

  it("detects updated, deleted and created facts and ignores page-level changes", () => {
    expect(diffFacts(v1, v2)).toEqual([
      { type: "updated", key: "classic burger|price", entityName: "classic burger", attributeName: "price", oldValue: "$12.00", newValue: "$15.00" },
      { type: "deleted", key: "truffle fries|price", entityName: "Truffle Fries", attributeName: "price", oldValue: "$8.50", newValue: null },
      { type: "created", key: "pumpkin risotto|price", entityName: "Pumpkin Risotto", attributeName: "price", oldValue: null, newValue: "$19.00" },
    ]);
  });

  it("treats equal normalized values as unchanged", () => {
    expect(diffFacts([nf("a", "Tea", "price", "4,50 AZN", "AZN 4.50")], [nf("a", "Tea", "cost", "AZN 4.50", "AZN 4.50")])).toEqual([]);
  });

  it("builds readable titles", () => {
    expect(changeTitle({ type: "updated", entityName: "Classic Burger", attributeName: "price", oldValue: "$12", newValue: "$15" })).toBe("Classic Burger price: $12 → $15");
    expect(changeTitle({ type: "deleted", entityName: "Kids menu", attributeName: "availability", oldValue: "yes", newValue: null })).toBe("Kids menu availability removed (was yes)");
  });
});

describe("findInconsistencies", () => {
  it("flags assets that disagree with the source of truth as outdated", () => {
    const r = findInconsistencies(
      [asset("prices", "csv"), asset("menu", "website"), asset("pdf", "pdf"), asset("promo", "marketing_content")],
      [nf("prices", "Classic Burger", "price", "$15.00", "USD 15.00"), nf("menu", "Classic Burger", "price", "$12.00", "USD 12.00"), nf("pdf", "Classic Burger", "price", "$12.00", "USD 12.00"), nf("promo", "Classic Burger", "price", "$15.00", "USD 15.00")],
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: "outdated", sourceAssetId: "prices", newValue: "$15.00", oldValue: "$12.00", assetIds: ["menu", "pdf"] });
  });

  it("flags disagreement between equally authoritative assets as conflicting", () => {
    const r = findInconsistencies(
      [asset("site", "website"), asset("pdf", "pdf"), asset("menu2", "website")],
      [nf("site", "Harborside", "phone", "+1 555 0124", "+15550124"), nf("pdf", "Harborside", "phone", "+1 555 0142", "+15550142"), nf("menu2", "Harborside", "phone", "+1 555 0142", "+15550142")],
    );
    expect(r[0]).toMatchObject({ type: "conflicting", newValue: "+1 555 0142", oldValue: "+1 555 0124" });
    expect(r[0]!.description).toBe("menu2, pdf: +1 555 0142 · site: +1 555 0124");
  });

  it("ignores consistent facts and single-asset facts", () => {
    expect(findInconsistencies([asset("a", "csv"), asset("b", "website")], [nf("a", "X", "price", "$1", "USD 1.00"), nf("b", "X", "price", "1.00 USD", "USD 1.00"), nf("a", "Y", "price", "$2", "USD 2.00")])).toEqual([]);
  });
});

describe("analyzeImpact", () => {
  // Price list (source) → menu page, printed menu, ordering page (syncs), POS; campaign references printed menu.
  const assets = [
    asset("prices", "csv", { isCustomerFacing: false }),
    asset("menu", "website"),
    asset("pdf", "pdf"),
    asset("order", "website", { scanStatus: "failed" }),
    asset("pos", "csv", { isCustomerFacing: false }),
    asset("promo", "marketing_content"),
    asset("home", "website"),
    asset("unrelated", "website"),
    asset("archived", "website", { status: "archived" }),
  ];
  const relationships = [
    rel("menu", "prices"),
    rel("pdf", "prices"),
    rel("order", "prices", "syncs_with", "confirmed", 0.95),
    rel("pos", "prices", "syncs_with"),
    rel("promo", "pdf", "references", "suggested", 0.68),
    rel("home", "menu", "links_to"),
    rel("unrelated", "prices", "duplicates", "rejected"),
    rel("archived", "prices"),
  ];
  const facts = [
    nf("prices", "Classic Burger", "price", "$15.00", "USD 15.00"),
    nf("prices", "Classic Burger", "category", "Mains", "mains"),
    nf("menu", "Classic Burger", "price", "$12.00", "USD 12.00", { method: "json_ld", confidence: 0.95 }),
    nf("pdf", "Classic Burger", "price", "$12.00", "USD 12.00", { location: { kind: "page", page: 2, line: 4 } }),
    nf("order", "Classic Burger", "price", "$12.00", "USD 12.00", { confidence: 0.7 }),
    nf("pos", "Classic Burger", "price", "$15.00", "USD 15.00"),
    nf("promo", "Burgers", "price", "$12", "USD 12.00"),
    nf("unrelated", "Classic Burger", "price", "$13.50", "USD 13.50", { confidence: 0.6 }),
  ];
  const change = { type: "updated" as const, entityName: "Classic Burger", attributeName: "Price", oldValue: "$12.00", newValue: "$15.00", sourceAssetId: "prices" };
  const report = analyzeImpact({ change, assets, relationships, facts });
  const by = (id: string) => report.impacts.find((i) => i.assetId === id);

  it("finds direct impacts (assets holding the fact) with their current values", () => {
    expect(by("menu")).toMatchObject({ containsFact: true, depth: 1, currentValue: "$12.00", newValue: "$15.00" });
    expect(by("menu")!.path).toEqual([{ assetId: "prices", relationship: "contains" }, { assetId: "menu", relationship: "derived_from" }]);
    expect(by("pdf")!.recommendedAction).toBe("Regenerate the document with Classic Burger price = $15.00 (Page 2, line 4); replace printed or shared copies.");
  });

  it("includes assets that hold the fact even without a relationship (shares)", () => {
    const u = by("unrelated");
    expect(u?.path).toEqual([{ assetId: "prices", relationship: "contains" }, { assetId: "unrelated", relationship: "shares" }]);
    expect(u?.inconsistent).toBe(true); // $13.50 is neither $12 nor $15
    expect(report.counts.inconsistencies).toBe(1);
  });

  it("finds indirect impacts through relationships, with lower confidence over suggested links", () => {
    const home = by("home");
    expect(home).toMatchObject({ containsFact: false, depth: 2, level: "low" });
    expect(home!.path.map((s) => s.relationship)).toEqual(["contains", "derived_from", "links_to"]);
    expect(home!.recommendedAction).toMatch(/^Check whether “home” shows Classic Burger price/);
    const promo = by("promo");
    expect(promo).toMatchObject({ depth: 2, containsFact: false });
    expect(promo!.reasons).toContain("The path includes a suggested (unconfirmed) relationship.");
    expect(promo!.confidence).toBeLessThan(0.3);
  });

  it("skips assets that already show the new value, archived assets and rejected relationships", () => {
    expect(by("pos")).toBeUndefined();
    expect(report.skipped).toEqual([{ assetId: "pos", reason: "Already shows $15.00." }]);
    expect(report.counts.alreadyUpdated).toBe(1);
    expect(by("archived")).toBeUndefined();
    expect(by("prices")).toBeUndefined(); // the source itself
  });

  it("ranks customer-facing assets holding the fact highest and lowers trust in unverified scans", () => {
    expect(by("menu")!.level).toBe("critical");
    expect(by("pdf")!.level).toBe("critical");
    expect(by("order")!.level).toBe("critical");
    expect(by("order")!.confidence).toBeLessThan(by("menu")!.confidence);
    expect(by("order")!.reasons).toContain("The last scan was incomplete, so the current value is not fully verified.");
    expect(report.impacts[0]!.level).toBe("critical");
    expect(report.relatedFacts).toEqual(["Classic Burger · category"]);
  });

  it("counts direct and indirect impacts and summarizes them", () => {
    expect(report.counts).toMatchObject({ direct: 4, indirect: 2 });
    expect(summarizeReport("Burger price", report)).toMatch(/^Burger price: 6 assets affected \(4 critical, 2 low\)\. 4 directly, 2 through relationships\. 1 already show the new value\. 1 show an unexpected value/);
  });

  it("handles deleted, created and changes without a source asset", () => {
    const del = analyzeImpact({ change: { ...change, type: "deleted", newValue: null }, assets, relationships, facts });
    expect(del.impacts.find((i) => i.assetId === "pos")?.recommendedAction).toBe("Remove Classic Burger price (Row 2 · Price) — it is no longer offered.");
    const created = analyzeImpact({ change: { type: "created", entityName: "Pumpkin Risotto", attributeName: "price", oldValue: null, newValue: "$19.00", sourceAssetId: "prices" }, assets, relationships, facts });
    expect(created.impacts.every((i) => !i.containsFact)).toBe(true);
    expect(created.impacts.find((i) => i.assetId === "menu")?.recommendedAction).toMatch(/should also list Pumpkin Risotto price/);
    const noSource = analyzeImpact({ change: { ...change, sourceAssetId: null }, assets, relationships, facts });
    expect(noSource.impacts.map((i) => i.assetId).sort()).toEqual(["menu", "order", "pdf", "unrelated"]);
    expect(noSource.impacts[0]!.path[0]!.relationship).toBe("shares");
  });

  it("is safe with cycles and respects the depth limit", () => {
    const cyc = [rel("a", "b"), rel("b", "c"), rel("c", "a"), rel("d", "c")];
    const r = analyzeImpact({ change: { ...change, sourceAssetId: "a" }, assets: ["a", "b", "c", "d"].map((x) => asset(x, "website")), relationships: cyc, facts: [], maxDepth: 1 });
    expect(r.impacts.map((i) => i.assetId)).toEqual(["c"]);
  });

  it("returns an empty report when nothing is affected", () => {
    const r = analyzeImpact({ change: { ...change, entityName: "Nothing", sourceAssetId: "unrelated" }, assets, relationships: [], facts });
    expect(r.impacts).toEqual([]);
    expect(summarizeReport("x", r)).toMatch(/Nothing needs updating/);
  });
});

describe("scoreToLevel and proposals", () => {
  it("maps scores to levels", () => {
    expect([7.5, 7, 6, 5, 4, 3, 2.5].map(scoreToLevel)).toEqual(["critical", "critical", "high", "high", "medium", "medium", "low"]);
  });

  it("creates pending proposals only for assets that hold the fact", () => {
    const assets = [asset("prices", "csv"), asset("menu", "website"), asset("home", "website")];
    const report = analyzeImpact({
      change: { type: "updated", entityName: "Tea", attributeName: "price", oldValue: "$4", newValue: "$5", sourceAssetId: "prices" },
      assets,
      relationships: [rel("menu", "prices"), rel("home", "menu", "links_to")],
      facts: [nf("menu", "Tea", "price", "$4", "USD 4.00")],
    });
    const proposals = buildProposals(report.impacts, assets, { type: "updated" }, "Rule-based");
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ targetAssetId: "menu", currentValue: "$4", proposedValue: "$5" });
    expect(proposals[0]!.evidence).toContainEqual({ label: "Path", detail: "prices → menu" });
    expect(proposals[0]!.evidence).toContainEqual({ label: "Analysis", detail: "Rule-based" });
  });
});

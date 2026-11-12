import { describe, expect, it } from "vitest";
import type { Asset, AssetRelationship, ExtractedFact } from "../workspace/model";
import { buildDependencyGraph } from "./build";
import { attributeKey, entityKey } from "./keys";
import { suggestRelationships } from "./suggest";
import { dependencyLayers, neighborhood } from "./traverse";

const asset = (id: string, type: Asset["type"], over: Partial<Asset> = {}) => ({ id, type, name: id, status: "active", isCustomerFacing: true, ...over }) as Asset;
let n = 0;
const fact = (assetId: string, entity: string, attribute: string, normalized: string, over: Partial<ExtractedFact> = {}) =>
  ({ id: `f${++n}`, assetId, entityName: entity, attributeName: attribute, valueText: normalized, normalizedValue: normalized, confidence: 0.9, method: "csv", assetVersion: 1, ...over }) as ExtractedFact;
const rel = (s: string, t: string, status: AssetRelationship["status"] = "confirmed", type: AssetRelationship["type"] = "derived_from") =>
  ({ id: `${s}-${t}`, sourceAssetId: s, targetAssetId: t, status, type, confidence: 1, origin: "manual", note: null, createdAt: "" }) as AssetRelationship;

describe("keys", () => {
  it("normalizes entities and attribute synonyms", () => {
    expect(entityKey("  Classic   Burger! ")).toBe("classic burger");
    expect(attributeKey("Price")).toBe("price");
    expect(attributeKey("Cost")).toBe("price");
    expect(attributeKey("Telephone")).toBe("phone");
    expect(attributeKey("Hours")).toBe("opening hours");
    expect(attributeKey("Category")).toBe("category");
  });
});

describe("suggestRelationships", () => {
  const prices = asset("prices", "csv");
  const menu = asset("menu", "website");
  const pdf = asset("pdf", "pdf");
  const promo = asset("promo", "marketing_content");
  const facts = [
    fact("prices", "Classic Burger", "price", "USD 15.00"),
    fact("prices", "Risotto", "price", "USD 19.00"),
    fact("prices", "Salmon", "price", "USD 24.00"),
    fact("menu", "Classic Burger", "Price", "USD 12.00"),
    fact("menu", "Risotto", "cost", "USD 19.00"),
    fact("menu", "Salmon", "price", "USD 24.00"),
    fact("pdf", "classic burger", "price", "USD 12.00"),
    fact("pdf", "RISOTTO", "price", "USD 19.00"),
    fact("promo", "Burgers", "price", "USD 12.00"),
    fact("menu", "Page", "page title", "menu"),
    fact("promo", "Page", "page title", "menu"),
  ];

  it("links derived assets to the source of truth with explainable evidence", () => {
    const s = suggestRelationships([prices, menu, pdf, promo], facts, []);
    const menuToPrices = s.find((x) => x.sourceAssetId === "menu" && x.targetAssetId === "prices");
    expect(menuToPrices).toMatchObject({ type: "derived_from", sharedFacts: 3, matchingValues: 2 });
    expect(menuToPrices!.confidence).toBeGreaterThanOrEqual(0.8);
    expect(menuToPrices!.note).toMatch(/3 shared facts \(Classic Burger · price, Risotto · price, Salmon · price\); 2 with matching values, 1 different/);
  });

  it("marks equally authoritative assets with identical shared facts as duplicates, otherwise references", () => {
    const s = suggestRelationships([prices, menu, pdf, promo], facts, []);
    const pair = s.find((x) => [x.sourceAssetId, x.targetAssetId].sort().join() === "menu,pdf");
    expect(pair?.type).toBe("duplicates");
    const differing = [...facts.filter((f) => f.assetId !== "pdf"), fact("pdf", "Classic Burger", "price", "USD 99.00"), fact("pdf", "Risotto", "price", "USD 98.00")];
    const s2 = suggestRelationships([menu, pdf], differing, []);
    expect(s2[0]?.type).toBe("references");
  });

  it("ignores page-level facts and pairs with a single shared fact", () => {
    const s = suggestRelationships([prices, menu, pdf, promo], facts, []);
    expect(s.some((x) => x.sourceAssetId === "promo" || x.targetAssetId === "promo")).toBe(false);
  });

  it("links assets that share an identifier such as a phone number", () => {
    const site = asset("site", "website");
    const record = asset("record", "manual");
    const s = suggestRelationships([site, record], [fact("site", "Harbor & Vine", "phone", "+15550142"), fact("record", "Downtown location", "Telephone", "+15550142")], []);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ sourceAssetId: "site", targetAssetId: "record", type: "references" });
    expect(s[0]!.note).toMatch(/same phone/);
  });

  it("never re-suggests a pair that already has a relationship, even a rejected one, in either direction", () => {
    const s = suggestRelationships([prices, menu, pdf], facts, [rel("prices", "menu", "rejected", "duplicates")]);
    expect(s.some((x) => [x.sourceAssetId, x.targetAssetId].sort().join() === "menu,prices")).toBe(false);
  });

  it("skips archived assets and is deterministic", () => {
    const archived = asset("menu", "website", { status: "archived" });
    expect(suggestRelationships([prices, archived, pdf], facts, []).some((x) => x.sourceAssetId === "menu")).toBe(false);
    expect(suggestRelationships([prices, menu, pdf, promo], facts, [])).toEqual(suggestRelationships([promo, pdf, menu, prices], [...facts].reverse(), []));
  });
});

describe("traverse", () => {
  const links = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "c", target: "d" },
    { source: "x", target: "y" },
  ];
  it("finds neighbors up to a depth", () => {
    expect([...neighborhood("b", links, 1).entries()]).toEqual([["b", 0], ["a", 1], ["c", 1]]);
    expect(neighborhood("a", links).get("d")).toBe(3);
    expect(neighborhood("a", links).has("x")).toBe(false);
  });
  it("computes dependency layers and survives cycles", () => {
    const l = dependencyLayers(["menu", "pdf", "prices", "promo"], [
      { source: "menu", target: "prices" },
      { source: "pdf", target: "prices" },
      { source: "promo", target: "pdf" },
    ]);
    expect(Object.fromEntries(l)).toEqual({ menu: 1, pdf: 1, prices: 0, promo: 2 });
    const cyc = dependencyLayers(["a", "b", "c"], [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "a" },
    ]);
    expect(cyc.size).toBe(3);
    expect([...cyc.values()].every((v) => Number.isFinite(v) && v >= 0 && v <= 3)).toBe(true);
  });
});

describe("buildDependencyGraph", () => {
  const assets = [asset("prices", "csv"), asset("menu", "website"), asset("pdf", "pdf"), asset("promo", "marketing_content"), asset("lonely", "manual"), asset("old", "pdf", { status: "archived" })];
  const relationships = [rel("menu", "prices"), rel("pdf", "prices"), rel("promo", "pdf", "suggested", "references"), rel("lonely", "old"), rel("menu", "pdf", "rejected", "duplicates")];
  const facts = [
    fact("prices", "Classic Burger", "price", "USD 15.00"),
    fact("menu", "Classic Burger", "price", "USD 12.00"),
    fact("pdf", "Classic Burger", "price", "USD 12.00"),
    fact("prices", "Risotto", "price", "USD 19.00"),
    fact("menu", "Risotto", "price", "USD 19.00"),
    fact("prices", "Only here", "price", "USD 1.00"),
    fact("menu", "Menu", "page title", "Menu"),
    fact("pdf", "Menu", "page title", "Menu"),
  ];
  const g = buildDependencyGraph({ assets, relationships, facts, factCounts: { prices: 3 } });
  const node = (id: string) => g.nodes.find((x) => x.id === id)!;

  it("creates asset nodes for active assets only, laid out by dependency", () => {
    expect(g.nodes.filter((x) => x.kind === "asset").map((x) => x.assetId).sort()).toEqual(["lonely", "menu", "pdf", "prices", "promo"]);
    expect(node("asset:prices").layer).toBe(0);
    expect(node("asset:menu").layer).toBe(1);
    expect(node("asset:promo").layer).toBe(2); // suggested edges count for layout
    expect(node("asset:menu").x).toBeGreaterThan(node("asset:prices").x);
    expect(node("asset:promo").x).toBeGreaterThan(node("asset:menu").x);
    expect(node("asset:prices").factsCount).toBe(3);
  });

  it("puts assets without live relationships into a 'Not connected' column", () => {
    const lonely = node("asset:lonely");
    expect(lonely.connected).toBe(false);
    expect(g.columns.at(-1)).toMatchObject({ title: "Not connected", x: lonely.x });
    expect(g.stats).toMatchObject({ connectedAssets: 4, disconnectedAssets: 1 });
  });

  it("creates information nodes only for facts shared by 2+ assets and flags inconsistent values", () => {
    const infos = g.nodes.filter((x) => x.kind === "information");
    expect(infos.map((x) => x.label).sort()).toEqual(["Classic Burger · price", "Risotto · price"]);
    const burger = node("info:classic burger|price");
    expect(burger.consistent).toBe(false);
    expect(burger.values!.filter((v) => !v.matchesMajority).map((v) => v.assetId)).toEqual(["prices"]);
    expect(g.stats).toMatchObject({ informationNodes: 2, inconsistentInformation: 1, entities: 2 });
  });

  it("derives every edge from records", () => {
    const rels = g.edges.filter((e) => e.kind === "relationship");
    expect(rels.map((e) => e.relationshipId).sort()).toEqual(["menu-pdf", "menu-prices", "pdf-prices", "promo-pdf"]); // archived endpoint dropped
    expect(rels.find((e) => e.relationshipId === "menu-pdf")?.status).toBe("rejected");
    const occ = g.edges.filter((e) => e.kind === "occurrence" && e.source === "info:classic burger|price");
    expect(occ.map((e) => [e.target, e.label, e.mismatch])).toContainEqual(["asset:prices", "USD 15.00", true]);
    expect(g.edges.filter((e) => e.kind === "attribute")).toHaveLength(2);
    expect(g.stats.relationships).toEqual({ confirmed: 2, suggested: 1, rejected: 1 });
  });

  it("returns an empty but valid graph for an empty workspace", () => {
    const empty = buildDependencyGraph({ assets: [], relationships: [], facts: [] });
    expect(empty.nodes).toEqual([]);
    expect(empty.stats.maxDepth).toBe(0);
  });

  it("stays fast for large workspaces", () => {
    const many = Array.from({ length: 1000 }, (_, i) => asset(`a${i}`, i % 2 ? "website" : "csv"));
    const manyRels = Array.from({ length: 999 }, (_, i) => rel(`a${i + 1}`, `a${i % 50}`));
    const manyFacts = many.flatMap((a, i) => [fact(a.id, `Item ${i % 100}`, "price", `USD ${i % 7}.00`)]);
    const t = performance.now();
    const big = buildDependencyGraph({ assets: many, relationships: manyRels, facts: manyFacts });
    expect(performance.now() - t).toBeLessThan(1500);
    expect(big.nodes.filter((x) => x.kind === "information").length).toBeLessThanOrEqual(80);
  });
});

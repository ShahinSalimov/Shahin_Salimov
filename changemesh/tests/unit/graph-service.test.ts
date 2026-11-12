import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { DemoWorkspaceData } = await import("@/server/data/demo");
const { refreshSuggestions } = await import("@/server/graph");
const { buildDependencyGraph } = await import("@/domain/graph/build");
const { makeFact } = await import("@/domain/extraction/fact");

async function twoMenus() {
  const data = new DemoWorkspaceData(crypto.randomUUID());
  const a = await data.createAsset({ type: "website", name: "Brunch page", description: null, sourceUrl: "https://x.example/brunch" });
  const b = await data.createAsset({ type: "pdf", name: "Brunch.pdf", description: null, sourceUrl: null });
  for (const id of [a.id, b.id]) {
    for (const [e, v] of [["Pancakes", "$9"], ["Omelette", "$11"]] as const) await data.addManualFact(id, makeFact(e, "price", v, { kind: "manual" }, 1, "manual")!);
  }
  return { data, a: a.id, b: b.id };
}

describe("refreshSuggestions", () => {
  it("stores new suggestions once and is idempotent", async () => {
    const { data, a, b } = await twoMenus();
    const created = await refreshSuggestions(data);
    expect(created).toBeGreaterThanOrEqual(1);
    const rel = (await data.snapshot()).relationships.find((r) => [r.sourceAssetId, r.targetAssetId].sort().join() === [a, b].sort().join());
    expect(rel).toMatchObject({ status: "suggested", origin: "rule", type: "duplicates" });
    expect(rel!.note).toMatch(/2 shared facts/);
    expect(await refreshSuggestions(data)).toBe(0);
  });

  it("never re-suggests a rejected pair", async () => {
    const { data, a, b } = await twoMenus();
    await refreshSuggestions(data);
    const rel = (await data.snapshot()).relationships.find((r) => [r.sourceAssetId, r.targetAssetId].sort().join() === [a, b].sort().join())!;
    await data.reviewRelationship(rel.id, "rejected");
    expect(await refreshSuggestions(data)).toBe(0);
    expect((await data.snapshot()).relationships.find((r) => r.id === rel.id)?.status).toBe("rejected");
  });

  it("refuses duplicate manual relationships in either direction", async () => {
    const { data, a, b } = await twoMenus();
    await data.createRelationship({ sourceAssetId: a, targetAssetId: b, type: "references", note: null });
    await expect(data.createRelationship({ sourceAssetId: b, targetAssetId: a, type: "references", note: null })).rejects.toThrow(/already have/);
    await data.createRelationship({ sourceAssetId: a, targetAssetId: b, type: "links_to", note: null });
  });
});

describe("demo graph", () => {
  it("is built entirely from the demo records", async () => {
    const data = new DemoWorkspaceData(crypto.randomUUID());
    const snap = await data.snapshot();
    const g = buildDependencyGraph({ assets: snap.assets, relationships: snap.relationships, facts: await data.workspaceFacts(), factCounts: snap.factCounts });
    expect(g.nodes.filter((n) => n.kind === "asset")).toHaveLength(snap.assets.length);
    const burger = g.nodes.find((n) => n.id === "info:classic burger|price");
    expect(burger?.consistent).toBe(false); // price list $15 vs menu/PDF/ordering page $12
    expect(burger?.values?.find((v) => v.assetId === "a-price-csv")?.normalized).toBe("USD 15.00");
    expect(g.edges.filter((e) => e.kind === "relationship")).toHaveLength(snap.relationships.length);
    expect(g.stats.maxDepth).toBeGreaterThan(0);
  });
});

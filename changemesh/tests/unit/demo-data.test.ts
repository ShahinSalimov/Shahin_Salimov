import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { DemoWorkspaceData } = await import("@/server/data/demo");
const { buildDemoSnapshot } = await import("@/server/demo/seed");

const sid = () => crypto.randomUUID();

describe("demo seed", () => {
  it("references only existing assets and changes", () => {
    const s = buildDemoSnapshot(new Date("2026-11-12T12:00:00Z"));
    const assets = new Set(s.assets.map((a) => a.id));
    const changes = new Set(s.changes.map((c) => c.id));
    for (const r of s.relationships) expect(assets.has(r.sourceAssetId) && assets.has(r.targetAssetId)).toBe(true);
    for (const i of s.impacts) {
      expect(assets.has(i.assetId)).toBe(true);
      expect(changes.has(i.changeId)).toBe(true);
      for (const step of i.path) expect(assets.has(step.assetId)).toBe(true);
    }
    for (const p of s.proposals) expect(assets.has(p.targetAssetId) && changes.has(p.changeId)).toBe(true);
  });

  it("labels every record as demo data and never fakes an integration", () => {
    const s = buildDemoSnapshot();
    expect([...s.assets, ...s.relationships, ...s.changes, ...s.impacts, ...s.proposals].every((r) => r.origin === "demo")).toBe(true);
    expect(s.integrations).toEqual([]);
  });

  it("never marks execution as started without approval", () => {
    for (const p of buildDemoSnapshot().proposals) {
      if (p.executionStatus !== "not_started") expect(p.approvalStatus).toBe("approved");
    }
  });
});

describe("demo intelligence", () => {
  it("gives every scanned asset a version record and consistent facts", async () => {
    const data = new DemoWorkspaceData(sid());
    const snap = await data.snapshot();
    for (const a of snap.assets.filter((x) => x.currentVersion > 0)) {
      expect(snap.versions.some((v) => v.assetId === a.id && v.version === a.currentVersion), a.id).toBe(true);
    }
    const menu = await data.assetIntelligence("a-menu-page");
    expect(menu.facts.find((f) => f.entityName === "Classic Burger")?.normalizedValue).toBe("USD 12.00"); // still outdated
    const prices = await data.assetIntelligence("a-price-csv");
    expect(prices.facts.find((f) => f.entityName === "Classic Burger" && f.attributeName === "price")?.normalizedValue).toBe("USD 15.00");
    expect(snap.factCounts["a-price-csv"]).toBe(21);
    const order = await data.assetIntelligence("a-order");
    expect(order.scans[0]).toMatchObject({ status: "failed" });
  });

  it("only lets manual facts be deleted", async () => {
    const data = new DemoWorkspaceData(sid());
    const manual = (await data.assetIntelligence("a-loc-harbor")).facts[0]!;
    await data.deleteFact(manual.id);
    const scanned = (await data.assetIntelligence("a-price-csv")).facts[0]!;
    await expect(data.deleteFact(scanned.id)).rejects.toThrow(/Only manually entered facts/);
  });

  it("deletes an asset with everything that depends on it", async () => {
    const data = new DemoWorkspaceData(sid());
    await data.deleteAsset("a-dinner-pdf");
    const snap = await data.snapshot();
    expect(snap.assets.some((a) => a.id === "a-dinner-pdf")).toBe(false);
    expect(snap.relationships.some((r) => r.sourceAssetId === "a-dinner-pdf" || r.targetAssetId === "a-dinner-pdf")).toBe(false);
    expect(snap.proposals.some((p) => p.targetAssetId === "a-dinner-pdf")).toBe(false);
    expect(snap.factCounts["a-dinner-pdf"]).toBeUndefined();
    expect(snap.audit[0]?.action).toBe("assets.delete");
  });
});

describe("DemoWorkspaceData", () => {
  it("records a decision once and refuses a second decision", async () => {
    const data = new DemoWorkspaceData(sid());
    await data.decideProposal({ proposalId: "p-c-burger-a-order", decision: "approved", comment: null });
    const snap = await data.snapshot();
    expect(snap.proposals.find((p) => p.id === "p-c-burger-a-order")?.approvalStatus).toBe("approved");
    expect(snap.audit[0]?.action).toBe("approvals.insert");
    await expect(data.decideProposal({ proposalId: "p-c-burger-a-order", decision: "rejected", comment: "x" })).rejects.toThrow(/already been decided/);
  });

  it("keeps at least one owner", async () => {
    const data = new DemoWorkspaceData(sid());
    await expect(data.updateMemberRole("demo-user-1", "viewer")).rejects.toThrow(/at least one owner/);
    await expect(data.removeMember("demo-user-1")).rejects.toThrow(/at least one owner/);
  });

  it("isolates sessions from each other", async () => {
    const a = new DemoWorkspaceData(sid());
    const b = new DemoWorkspaceData(sid());
    await a.createAsset({ type: "manual", name: "Only in A", description: null, sourceUrl: null });
    expect((await a.snapshot()).assets.some((x) => x.name === "Only in A")).toBe(true);
    expect((await b.snapshot()).assets.some((x) => x.name === "Only in A")).toBe(false);
  });

  it("returns copies, so callers cannot mutate session state", async () => {
    const data = new DemoWorkspaceData(sid());
    const snap = await data.snapshot();
    snap.assets.length = 0;
    expect((await data.snapshot()).assets.length).toBeGreaterThan(0);
  });
});

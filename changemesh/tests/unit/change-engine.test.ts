import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { DemoWorkspaceData } = await import("@/server/data/demo");
const { runImpactAnalysis, detectInconsistencies, detectChangesFromVersion } = await import("@/server/changes/engine");
const { ingestUpload } = await import("@/server/intelligence/runner");

const viewer = { kind: "demo" as const, sessionId: "test" };
const session = () => new DemoWorkspaceData(crypto.randomUUID());
const enc = (s: string) => new TextEncoder().encode(s);

describe("runImpactAnalysis on the demo workspace", () => {
  it("computes the burger price change from demo records (rules only in demo)", async () => {
    const data = session();
    const out = await runImpactAnalysis(data, viewer, "c-burger", { useAi: true });
    expect(out.generatedBy).toBe("rules"); // demo never calls AI
    const snap = await data.snapshot();
    const change = snap.changes.find((c) => c.id === "c-burger")!;
    expect(change.analysis).toMatchObject({ generatedBy: "rules", model: null });
    const impacted = snap.impacts.filter((i) => i.changeId === "c-burger").map((i) => i.assetId);
    for (const id of ["a-menu-page", "a-dinner-pdf", "a-order"]) expect(impacted).toContain(id); // all still say $12
    expect(impacted).not.toContain("a-price-csv"); // the source
    expect(change.analysis!.notes!["a-order"]!.reasons).toContain("The last scan was incomplete, so the current value is not fully verified.");
    expect(change.analysis!.summary).toMatch(/affected/);
  });

  it("keeps decided proposals and replaces pending ones", async () => {
    const data = session();
    await runImpactAnalysis(data, viewer, "c-burger", { useAi: false });
    const before = (await data.snapshot()).proposals.filter((p) => p.changeId === "c-burger");
    const approved = before.find((p) => p.approvalStatus === "approved"); // seeded approval for the menu page
    expect(approved).toBeDefined();
    await runImpactAnalysis(data, viewer, "c-burger", { useAi: false });
    const after = (await data.snapshot()).proposals.filter((p) => p.changeId === "c-burger");
    expect(after.find((p) => p.id === approved!.id)?.approvalStatus).toBe("approved");
    expect(new Set(after.map((p) => p.targetAssetId)).size).toBe(after.length); // one proposal per asset
    expect(after.every((p) => ["pending", "approved", "needs_revision", "rejected"].includes(p.approvalStatus))).toBe(true);
    expect(after.filter((p) => p.approvalStatus === "pending").every((p) => p.executionStatus === "not_started")).toBe(true);
  });

  it("refuses closed changes", async () => {
    await expect(runImpactAnalysis(session(), viewer, "c-risotto", { useAi: false })).rejects.toThrow(/Closed changes/);
  });
});

describe("detectInconsistencies", () => {
  it("records outdated prices once and does not duplicate open issues", async () => {
    const data = session();
    const first = await detectInconsistencies(data, viewer);
    expect(first.created).toBeGreaterThan(0);
    const snap = await data.snapshot();
    const outdated = snap.changes.find((c) => c.type === "outdated" && c.entityName === "Classic Burger");
    expect(outdated).toMatchObject({ newValue: "$15.00", sourceAssetId: "a-price-csv", origin: "rule", status: "pending_approval" });
    const second = await detectInconsistencies(data, viewer);
    expect(second.created).toBe(0);
    expect(second.existing).toBe(first.created + first.existing);
    expect(first.existing).toBeGreaterThanOrEqual(1); // the seeded "Truffle Fries" outdated change is not duplicated
  });
});

describe("detectChangesFromVersion", () => {
  it("records created, updated and deleted facts between two uploaded versions", async () => {
    const data = session();
    const { id } = await data.createAsset({ type: "csv", name: "Brunch prices", description: null, sourceUrl: null });
    const asset = async () => (await data.snapshot()).assets.find((a) => a.id === id)!;
    await ingestUpload(data, await asset(), { name: "v1.csv", bytes: enc("Item,Price\nPancakes,$9\nOmelette,$11\n") });
    const v2 = await ingestUpload(data, await asset(), { name: "v2.csv", bytes: enc("Item,Price\nPancakes,$10\nWaffles,$8\n") });
    expect(await detectChangesFromVersion(data, viewer, id, 1)).toBe(0);
    const n = await detectChangesFromVersion(data, viewer, id, v2.assetVersion!);
    expect(n).toBe(3);
    const changes = (await data.snapshot()).changes.filter((c) => c.sourceAssetId === id).map((c) => [c.type, c.title, c.origin]);
    expect(changes).toEqual(
      expect.arrayContaining([
        ["updated", "Pancakes price: $9 → $10", "scan"],
        ["deleted", "Omelette price removed (was $11)", "scan"],
        ["created", "New Waffles price: $8", "scan"],
      ]),
    );
  });
});

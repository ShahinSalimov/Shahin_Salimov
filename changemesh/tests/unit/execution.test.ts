import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { DemoWorkspaceData } = await import("@/server/data/demo");
const { executeProposal, rollbackProposal, simulateProposal } = await import("@/server/execution/service");
const { runImpactAnalysis } = await import("@/server/changes/engine");

const viewer = { kind: "demo" as const, sessionId: "t" };
const session = () => new DemoWorkspaceData(crypto.randomUUID());
const proposal = async (data: InstanceType<typeof DemoWorkspaceData>, id: string) => (await data.snapshot()).proposals.find((p) => p.id === id)!;

describe("manual confirmation (external assets)", () => {
  it("requires approval, then a note, records the result and marks the change status", async () => {
    const data = session();
    await expect(executeProposal(data, "p-c-burger-a-order", "done")).rejects.toThrow(/Only approved/);
    await data.decideProposal({ proposalId: "p-c-burger-a-order", decision: "approved", comment: null });
    expect((await proposal(data, "p-c-burger-a-order")).executionStatus).toBe("ready");
    await expect(executeProposal(data, "p-c-burger-a-order", " ")).rejects.toThrow(/Describe how the update was applied/);
    expect((await data.executions()).filter((e) => e.proposalId === "p-c-burger-a-order")).toHaveLength(0); // no failed attempt recorded
    const out = await executeProposal(data, "p-c-burger-a-order", "Updated in the ordering system");
    expect(out).toMatchObject({ succeeded: true, status: "completed" });
    const p = await proposal(data, "p-c-burger-a-order");
    expect(p.executionResult).toMatchObject({ mode: "manual", confirmedManually: true, note: "Updated in the ordering system", idempotencyKey: p.idempotencyKey });
  });

  it("cannot run twice and can be reopened", async () => {
    const data = session();
    await data.decideProposal({ proposalId: "p-c-burger-a-order", decision: "approved", comment: null });
    await executeProposal(data, "p-c-burger-a-order", "done");
    await expect(executeProposal(data, "p-c-burger-a-order", "again")).rejects.toThrow(/completed and cannot be executed again/);
    const r = await rollbackProposal(data, "p-c-burger-a-order");
    expect(r).toMatchObject({ succeeded: true, status: "ready" });
    const history = (await data.executions()).filter((e) => e.proposalId === "p-c-burger-a-order").map((e) => `${e.action}:${e.status}:${e.attempt}`);
    expect(history).toEqual(["rollback:succeeded:2", "execute:succeeded:1"]);
  });
});

describe("internal records", () => {
  it("really updates a manual record, is idempotent and can be undone", async () => {
    const data = session();
    // Downtown opening hours are kept in a manual record: register a change there and analyze it.
    const { id: changeId } = await data.createChange({ title: "Downtown phone", type: "updated", entityName: "Downtown location", attributeName: "phone", oldValue: "+1 555 0100", newValue: "+1 555 0199", description: null, sourceAssetId: "a-home" });
    await data.createRelationship({ sourceAssetId: "a-loc-downtown", targetAssetId: "a-home", type: "references", note: null });
    await runImpactAnalysis(data, viewer, changeId, { useAi: false });
    const p = (await data.snapshot()).proposals.find((x) => x.changeId === changeId && x.targetAssetId === "a-loc-downtown")!;
    expect(p).toBeDefined();
    await data.decideProposal({ proposalId: p.id, decision: "approved", comment: null });

    const sim = await simulateProposal(data, p.id);
    expect(sim).toMatchObject({ mode: "internal", before: "+1 555 0100", after: "+1 555 0199", externalEffect: false });
    expect((await data.assetIntelligence("a-loc-downtown")).facts.find((f) => f.attributeName === "phone")?.valueText).toBe("+1 555 0100"); // simulation changed nothing

    expect(await executeProposal(data, p.id, null)).toMatchObject({ succeeded: true, status: "completed" });
    expect((await data.assetIntelligence("a-loc-downtown")).facts.filter((f) => f.attributeName === "phone").map((f) => f.valueText)).toEqual(["+1 555 0199"]);
    expect((await data.snapshot()).changes.find((c) => c.id === changeId)?.status).not.toBe("pending_approval");

    expect(await rollbackProposal(data, p.id)).toMatchObject({ succeeded: true, status: "ready" });
    expect((await data.assetIntelligence("a-loc-downtown")).facts.filter((f) => f.attributeName === "phone").map((f) => f.valueText)).toEqual(["+1 555 0100"]);

    // Re-executing after rollback works and keeps the same idempotency key.
    await executeProposal(data, p.id, null);
    const runs = (await data.executions()).filter((e) => e.proposalId === p.id && e.action === "execute");
    expect(new Set(runs.map((e) => e.idempotencyKey)).size).toBe(1);
  });

  it("records failures honestly", async () => {
    const data = session();
    const { id: changeId } = await data.createChange({ title: "No subject", type: "updated", entityName: null, attributeName: null, oldValue: "a", newValue: "b", description: null, sourceAssetId: null });
    // Proposals are created by analysis; craft one through the same API.
    await data.saveChangeAnalysis(changeId, {
      impacts: [],
      proposals: [{ targetAssetId: "a-loc-harbor", currentValue: "a", proposedValue: "b", reason: "test", evidence: [], impactLevel: "low", origin: "rule" }],
      analysis: { generatedBy: "rules", summary: "", warnings: [], counts: { critical: 0, high: 0, medium: 0, low: 1, direct: 1, indirect: 0, alreadyUpdated: 0, inconsistencies: 0 } },
    });
    const p = (await data.snapshot()).proposals.find((x) => x.changeId === changeId)!;
    await data.decideProposal({ proposalId: p.id, decision: "approved", comment: null });
    const out = await executeProposal(data, p.id, null);
    expect(out).toMatchObject({ succeeded: false, status: "failed" });
    expect(out.message).toMatch(/no entity and attribute/);
    const last = (await data.executions())[0]!;
    expect(last).toMatchObject({ status: "failed", action: "execute" });
  });
});

import { describe, expect, it } from "vitest";
import type { Asset, Change, ChangeImpact, UpdateProposal, WorkspaceSnapshot } from "../workspace/model";
import { assetHealth, assetHealthSummary, connectedAssetIds, dashboardMetrics, impactOverview, weeklyChangeTrend } from "./metrics";

const NOW = new Date("2026-11-12T12:00:00Z");
const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86400_000).toISOString();

function asset(id: string, over: Partial<Asset> = {}): Asset {
  return {
    id, type: "website", name: id, description: null, sourceUrl: "https://x.test", mimeType: null, sizeBytes: null, status: "active",
    scanStatus: "succeeded", lastScannedAt: iso(1), lastScanError: null, currentVersion: 1, isCustomerFacing: true, origin: "manual",
    createdAt: iso(10), updatedAt: iso(1), ...over,
  };
}
function change(id: string, over: Partial<Change> = {}): Change {
  return { id, title: id, description: null, type: "updated", status: "pending_approval", sourceAssetId: null, entityName: null, attributeName: null, oldValue: "12", newValue: "15", origin: "manual", createdAt: iso(2), ...over };
}
function impact(changeId: string, assetId: string, level: ChangeImpact["level"]): ChangeImpact {
  return { id: `${changeId}-${assetId}`, changeId, assetId, level, depth: 1, path: [], oldValue: null, newValue: null, confidence: 0.9, recommendedAction: null, origin: "rule", createdAt: iso(2) };
}
function proposal(changeId: string, assetId: string, over: Partial<UpdateProposal> = {}): UpdateProposal {
  return { id: `p-${changeId}-${assetId}`, changeId, changeImpactId: null, targetAssetId: assetId, currentValue: "12", proposedValue: "15", reason: null, evidence: [], impactLevel: "high", approvalStatus: "pending", executionStatus: "not_started", origin: "rule", createdAt: iso(2), updatedAt: iso(2), ...over };
}

function snapshot(over: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return { assets: [], versions: [], relationships: [], changes: [], impacts: [], proposals: [], approvals: [], integrations: [], audit: [], auditVisible: true, members: [], subscription: null, ...over };
}

describe("assetHealth", () => {
  const s = snapshot({
    changes: [change("c1"), change("c2", { status: "completed" })],
    impacts: [impact("c1", "a-out", "high"), impact("c2", "a-closed", "low"), impact("c1", "a-done", "low")],
    proposals: [proposal("c1", "a-done", { approvalStatus: "approved", executionStatus: "completed" })],
  });

  it("flags scan problems first", () => {
    expect(assetHealth(asset("a-out", { scanStatus: "failed" }), s)).toBe("scan_issue");
    expect(assetHealth(asset("x", { scanStatus: "partial" }), s)).toBe("scan_issue");
  });
  it("marks assets affected by open, unexecuted changes as outdated", () => {
    expect(assetHealth(asset("a-out"), s)).toBe("outdated");
  });
  it("ignores closed changes and completed updates", () => {
    expect(assetHealth(asset("a-closed"), s)).toBe("healthy");
    expect(assetHealth(asset("a-done"), s)).toBe("healthy");
  });
  it("never reports unscanned assets as healthy, except manual records", () => {
    expect(assetHealth(asset("u", { scanStatus: "not_scanned" }), s)).toBe("unscanned");
    expect(assetHealth(asset("m", { type: "manual", scanStatus: "not_scanned", sourceUrl: null }), s)).toBe("healthy");
  });
  it("summarizes only active assets", () => {
    const sum = assetHealthSummary({ ...s, assets: [asset("a-out"), asset("ok"), asset("arch", { status: "archived", scanStatus: "failed" })] });
    expect(sum).toEqual({ healthy: 1, outdated: 1, scan_issue: 0, unscanned: 0 });
  });
});

describe("dashboardMetrics", () => {
  it("counts assets, changes, approvals and conflicts", () => {
    const s = snapshot({
      assets: [asset("a"), asset("b"), asset("c"), asset("z", { status: "archived" })],
      relationships: [
        { id: "r1", sourceAssetId: "a", targetAssetId: "b", type: "embeds", status: "confirmed", confidence: 1, origin: "manual", note: null, createdAt: iso(3) },
        { id: "r2", sourceAssetId: "b", targetAssetId: "c", type: "links_to", status: "suggested", confidence: 0.6, origin: "rule", note: null, createdAt: iso(3) },
      ],
      changes: [change("c1"), change("c2", { type: "conflicting" }), change("c3", { status: "completed", createdAt: iso(40) }), change("c4", { type: "outdated", status: "cancelled" })],
      proposals: [proposal("c1", "a"), proposal("c1", "b", { approvalStatus: "needs_revision" }), proposal("c2", "c", { approvalStatus: "approved" })],
    });
    expect(dashboardMetrics(s, NOW)).toEqual({
      totalAssets: 3,
      connectedAssets: 2,
      detectedChanges: 2,
      changesLast30Days: 3,
      pendingApprovals: 1,
      needsRevision: 1,
      potentialConflicts: 1,
      suggestedRelationships: 1,
    });
    expect([...connectedAssetIds(s)].sort()).toEqual(["a", "b"]);
  });
});

describe("impactOverview", () => {
  it("totals open-change impacts and sorts changes by severity", () => {
    const s = snapshot({
      changes: [change("low"), change("crit"), change("closed", { status: "completed" })],
      impacts: [impact("low", "a", "low"), impact("crit", "a", "critical"), impact("crit", "b", "medium"), impact("closed", "a", "critical")],
    });
    const o = impactOverview(s);
    expect(o.totals).toEqual({ critical: 1, high: 0, medium: 1, low: 1 });
    expect(o.changes.map((c) => c.change.id)).toEqual(["crit", "low"]);
    expect(o.changes[0]).toMatchObject({ affectedAssets: 2, highestLevel: "critical" });
  });
});

describe("weeklyChangeTrend", () => {
  it("buckets changes per week, oldest first", () => {
    const trend = weeklyChangeTrend([change("a", { createdAt: iso(1) }), change("b", { createdAt: iso(2) }), change("c", { createdAt: iso(10) }), change("d", { createdAt: iso(100) })], NOW, 4);
    expect(trend.map((t) => t.count)).toEqual([0, 0, 1, 2]);
  });
});

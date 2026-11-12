import { describe, expect, it } from "vitest";
import type { AuditEvent } from "../workspace/model";
import { describeEvent } from "./activity";

const snap = {
  assets: [{ id: "a1", name: "Menu page" }],
  changes: [{ id: "c1", title: "Burger price" }],
  proposals: [{ id: "p1", targetAssetId: "a1" }],
  members: [{ userId: "u2", fullName: "Maya Chen", email: "m@x.test", role: "admin" }],
} as never;

const ev = (action: string, targetId: string | null, metadata: Record<string, unknown> = {}, actorName: string | null = "Daniel"): AuditEvent => ({
  id: "e",
  actorId: actorName ? "u1" : null,
  actorName,
  actorType: actorName ? "user" : "system",
  action,
  targetType: action.split(".")[0]!,
  targetId,
  metadata,
  createdAt: "2026-11-12T00:00:00Z",
});

describe("describeEvent", () => {
  it("describes scan failures as system events", () => {
    const d = describeEvent(ev("assets.update", "a1", { changed: ["scan_status"], status: "failed" }, null), snap, "/w/x");
    expect(d).toMatchObject({ actor: "CHANGEMESH", isSystem: true, verb: "scan failed for", target: "Menu page", targetHref: "/w/x/assets/a1", category: "assets" });
  });
  it("describes approvals of proposals", () => {
    const d = describeEvent(ev("update_proposals.update", "p1", { changed: ["approval_status"], status: "approved" }), snap, "/w/x");
    expect(d).toMatchObject({ verb: "approved", target: "update for Menu page", category: "approvals" });
  });
  it("describes role changes with member names", () => {
    const d = describeEvent(ev("workspace_members.update", "u2", { changed: ["role"], role: "editor", user_id: "u2" }), snap, "/w/x");
    expect(d.target).toBe("Maya Chen → Editor");
  });
  it("links changes and falls back for deleted targets", () => {
    expect(describeEvent(ev("changes.insert", "c1"), snap, "/w/x").targetHref).toBe("/w/x/changes/c1");
    const gone = describeEvent(ev("changes.insert", "c-gone", { name: "Old change" }), snap, "/w/x");
    expect(gone).toMatchObject({ target: "Old change", targetHref: null });
  });
  it("keeps unknown actions readable", () => {
    expect(describeEvent(ev("billing.sync", null), snap, "/w/x").verb).toBe("billing sync");
  });
});

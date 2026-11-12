import { describe, expect, it } from "vitest";
import type { Asset, AssetRelationship } from "../workspace/model";
import { graphStats } from "./graph-stats";

const a = (id: string, status: Asset["status"] = "active") => ({ id, status }) as Asset;
const r = (s: string, t: string, status: AssetRelationship["status"] = "confirmed") => ({ id: `${s}-${t}`, sourceAssetId: s, targetAssetId: t, status }) as AssetRelationship;

describe("graphStats", () => {
  it("computes depth, clusters and disconnected assets from confirmed edges only", () => {
    const stats = graphStats(
      [a("a"), a("b"), a("c"), a("d"), a("e"), a("f"), a("x", "archived")],
      [r("a", "b"), r("b", "c"), r("c", "d"), r("e", "f"), r("d", "e", "suggested"), r("a", "x"), r("a", "c", "rejected")],
    );
    expect(stats.maxDepth).toBe(3); // a-b-c-d
    expect(stats.clusters).toEqual([4, 2]);
    expect(stats.disconnected).toEqual([]);
    expect(stats).toMatchObject({ confirmed: 4, suggested: 1, rejected: 1 });
  });

  it("handles cycles and isolated assets", () => {
    const stats = graphStats([a("a"), a("b"), a("c"), a("lonely")], [r("a", "b"), r("b", "c"), r("c", "a")]);
    expect(stats.maxDepth).toBe(1);
    expect(stats.disconnected.map((x) => x.id)).toEqual(["lonely"]);
  });

  it("returns zero depth for an empty graph", () => {
    expect(graphStats([], []).maxDepth).toBe(0);
  });
});

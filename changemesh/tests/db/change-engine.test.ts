import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDatabase, expectDbError } from "./harness";

let pool: pg.Pool;
let owner: string;
let editor: string;
let viewer: string;
let outsider: string;
let ws: string;
let a: string;
let b: string;
let change: string;

const impacts = (rows: [string, string][]) =>
  JSON.stringify(rows.map(([asset, level]) => ({ asset_id: asset, impact_level: level, depth: 1, relationship_path: [{ assetId: asset, relationship: "shares" }], old_value: "$12", new_value: "$15", confidence: 0.9, recommended_action: "Update", origin: "rule" })));
const proposals = (assets: string[]) =>
  JSON.stringify(assets.map((asset) => ({ target_asset_id: asset, current_value: "$12", proposed_value: "$15", reason: "Update", evidence: [{ label: "Analysis", detail: "Rule-based" }], impact_level: "high", origin: "rule" })));
const save = (user: string, imp: string, prop: string) =>
  asUser(pool, user, async (q) => (await q("select * from public.save_change_analysis($1, $2, $3, $4)", [change, imp, prop, JSON.stringify({ generatedBy: "rules" })])).rows[0]);

beforeAll(async () => {
  pool = await createTestDatabase("changemesh_engine_test");
  owner = await createAuthUser(pool, "owner@eng.test");
  editor = await createAuthUser(pool, "editor@eng.test");
  viewer = await createAuthUser(pool, "viewer@eng.test");
  outsider = await createAuthUser(pool, "out@eng.test");
  ws = await asUser(pool, owner, async (q) => (await q<{ workspace_id: string }>("select * from public.create_organization_with_workspace('Eng','eng','Main','main')")).rows[0]!.workspace_id);
  await asUser(pool, outsider, (q) => q("select * from public.create_organization_with_workspace('Out','out-e','Main','main')"));
  await pool.query("insert into public.workspace_members (workspace_id, user_id, role) values ($1,$2,'editor'),($1,$3,'viewer')", [ws, editor, viewer]);
  await asUser(pool, editor, async (q) => {
    a = (await q<{ id: string }>("insert into public.assets (workspace_id, type, name) values ($1,'manual','Menu') returning id", [ws])).rows[0]!.id;
    b = (await q<{ id: string }>("insert into public.assets (workspace_id, type, name) values ($1,'manual','PDF') returning id", [ws])).rows[0]!.id;
    change = (await q<{ id: string }>("insert into public.changes (workspace_id, title, change_type) values ($1,'Burger price','updated') returning id", [ws])).rows[0]!.id;
  });
});

afterAll(async () => {
  await pool?.end();
});

describe("save_change_analysis", () => {
  it("stores impacts and pending proposals and moves the change to pending approval", async () => {
    const r = await save(editor, impacts([[a, "critical"], [b, "low"]]), proposals([a, b]));
    expect(r).toEqual({ impacts_saved: 2, proposals_created: 2, proposals_kept: 0, new_status: "pending_approval" });
    const { rows } = await pool.query("select approval_status, execution_status, change_impact_id is not null linked from public.update_proposals where change_id = $1", [change]);
    expect(rows.every((x) => x.approval_status === "pending" && x.execution_status === "not_started" && x.linked)).toBe(true);
    const c = await pool.query("select analysis->>'generatedBy' g, analyzed_at is not null at from public.changes where id = $1", [change]);
    expect(c.rows[0]).toEqual({ g: "rules", at: true });
  });

  it("re-analysis replaces pending proposals but keeps decided ones", async () => {
    const pa = (await pool.query("select id from public.update_proposals where change_id = $1 and target_asset_id = $2", [change, a])).rows[0].id;
    await asUser(pool, owner, (q) => q("select public.decide_update_proposal($1, 'approved', null)", [pa]));
    const r = await save(editor, impacts([[a, "critical"], [b, "medium"]]), proposals([a, b]));
    expect(r).toMatchObject({ impacts_saved: 2, proposals_created: 1, proposals_kept: 1 });
    const { rows } = await pool.query("select target_asset_id, approval_status from public.update_proposals where change_id = $1 order by approval_status::text", [change]);
    expect(rows).toEqual([
      { target_asset_id: a, approval_status: "approved" },
      { target_asset_id: b, approval_status: "pending" },
    ]);
    const approvals = await pool.query("select count(*)::int n from public.approvals where proposal_id = $1", [pa]);
    expect(approvals.rows[0].n).toBe(1);
  });

  it("is refused for viewers and other tenants", async () => {
    expect((await expectDbError(save(viewer, impacts([]), proposals([])))).code).toMatch(/42501|P0001/);
    expect((await expectDbError(save(outsider, impacts([]), proposals([])))).message).toMatch(/Change not found/);
  });

  it("cannot insert approved proposals through the analysis payload", async () => {
    const forged = JSON.stringify([{ target_asset_id: a, approval_status: "approved", execution_status: "completed", impact_level: "low", origin: "ai" }]);
    await save(editor, impacts([[a, "low"]]), forged);
    const { rows } = await pool.query("select approval_status from public.update_proposals where change_id = $1 and approval_status <> 'pending'", [change]);
    expect(rows.map((r) => r.approval_status)).toEqual(["approved"]); // only the one approved by the owner above
  });

  it("refuses to analyze a closed change", async () => {
    await pool.query("update public.changes set status = 'completed' where id = $1", [change]);
    expect((await expectDbError(save(editor, impacts([]), proposals([])))).message).toMatch(/closed change/);
    await pool.query("update public.changes set status = 'analyzed' where id = $1", [change]);
  });
});

describe("ai_usage", () => {
  it("lets editors record usage that members can read but nobody can edit", async () => {
    await asUser(pool, editor, (q) => q("insert into public.ai_usage (workspace_id, change_id, operation, provider, model, status, input_tokens, output_tokens, cost_usd) values ($1,$2,'impact_analysis','claude','claude-opus-5-5','succeeded',1200,300,0.0108)", [ws, change]));
    expect((await asUser(pool, viewer, (q) => q("select cost_usd from public.ai_usage"))).rows).toEqual([{ cost_usd: "0.010800" }]);
    expect((await expectDbError(asUser(pool, viewer, (q) => q("insert into public.ai_usage (workspace_id, operation, provider, model, status) values ($1,'impact_analysis','claude','x','succeeded')", [ws])))).code).toBe("42501");
    expect((await expectDbError(asUser(pool, editor, (q) => q("update public.ai_usage set cost_usd = 0")))).code).toBe("42501");
    expect((await expectDbError(asUser(pool, owner, (q) => q("delete from public.ai_usage")))).code).toBe("42501");
    expect((await asUser(pool, outsider, (q) => q("select * from public.ai_usage"))).rowCount).toBe(0);
  });
});

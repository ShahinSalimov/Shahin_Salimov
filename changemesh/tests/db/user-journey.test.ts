import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDatabase } from "./harness";

/**
 * Stage 8 acceptance flow at the database level, through the same RPCs and
 * RLS the app uses: a new user registers, creates a workspace, adds assets,
 * scans them, sees a relationship, records a change, inspects the impact and
 * approves (then applies) the update proposal. A second user is invited.
 */
let pool: pg.Pool;
let founder: string;
let teammate: string;
let ws: string;
let org: string;
const assets: Record<string, string> = {};
let relationship: string;
let change: string;
let proposal: string;

const fact = (value: string, method: string) => ({
  entity_name: "Classic Burger",
  attribute_name: "price",
  value_text: value,
  value_number: null,
  value_unit: null,
  normalized_value: value.toLowerCase(),
  source_location: { kind: "row", row: 1 },
  confidence: 0.9,
  method,
});

beforeAll(async () => {
  pool = await createTestDatabase("changemesh_journey_test");
});

afterAll(async () => {
  await pool?.end();
});

describe("new customer journey", () => {
  it("1. registers (Supabase Auth creates the profile)", async () => {
    founder = await createAuthUser(pool, "founder@bistro.test", "Lea Founder");
    const { rows } = await pool.query("select email, full_name from public.profiles where id = $1", [founder]);
    expect(rows[0]).toEqual({ email: "founder@bistro.test", full_name: "Lea Founder" });
  });

  it("2. creates an organization and its first workspace (becomes owner)", async () => {
    const row = await asUser(pool, founder, async (q) => (await q<{ organization_id: string; workspace_id: string }>("select * from public.create_organization_with_workspace('Bistro Group','bistro','Downtown','downtown')")).rows[0]!);
    org = row.organization_id;
    ws = row.workspace_id;
    const { rows } = await pool.query("select role from public.workspace_members where workspace_id = $1 and user_id = $2", [ws, founder]);
    expect(rows[0].role).toBe("owner");
  });

  it("3. adds assets and scans them into facts", async () => {
    await asUser(pool, founder, async (q) => {
      assets.csv = (await q<{ id: string }>("insert into public.assets (workspace_id, type, name) values ($1,'csv','Price list.csv') returning id", [ws])).rows[0]!.id;
      assets.pdf = (await q<{ id: string }>("insert into public.assets (workspace_id, type, name) values ($1,'pdf','Menu.pdf') returning id", [ws])).rows[0]!.id;
      for (const [key, method] of [["csv", "csv"], ["pdf", "pdf_text"]] as const) {
        const scan = (await q<{ id: string }>("select public.start_asset_scan($1, 'upload') as id", [assets[key]])).rows[0]!.id;
        const r = (await q("select * from public.record_scan_result($1,'succeeded',$2,'{}',$3,'[]',null,'{}')", [scan, `hash-${key}`, JSON.stringify([fact("$12.00", method)])])).rows[0];
        expect(r).toMatchObject({ asset_version: 1, new_version: true, facts_count: 1 });
      }
    });
    const facts = await asUser(pool, founder, async (q) => (await q("select asset_id from public.current_facts where workspace_id = $1 and entity_name = 'Classic Burger'", [ws])).rows);
    expect(facts).toHaveLength(2);
  });

  it("4. sees the relationship (rule suggestion, then confirmed)", async () => {
    relationship = await asUser(pool, founder, async (q) =>
      (await q<{ id: string }>("insert into public.asset_relationships (workspace_id, source_asset_id, target_asset_id, relationship_type, status, origin, confidence, note) values ($1,$2,$3,'derived_from','suggested','rule',0.8,'Shares Classic Burger price') returning id", [ws, assets.pdf, assets.csv])).rows[0]!.id,
    );
    await asUser(pool, founder, (q) => q("update public.asset_relationships set status = 'confirmed' where id = $1", [relationship]));
    const { rows } = await pool.query("select status, reviewed_by from public.asset_relationships where id = $1", [relationship]);
    expect(rows[0]).toEqual({ status: "confirmed", reviewed_by: founder });
  });

  it("5. records a change and inspects the impact", async () => {
    change = await asUser(pool, founder, async (q) =>
      (await q<{ id: string }>("insert into public.changes (workspace_id, title, change_type, entity_name, attribute_name, old_value, new_value, source_asset_id) values ($1,'Classic Burger $12.00 → $15.00','updated','Classic Burger','price','$12.00','$15.00',$2) returning id", [ws, assets.csv])).rows[0]!.id,
    );
    const impacts = [{ asset_id: assets.pdf, impact_level: "high", depth: 1, relationship_path: [{ assetId: assets.pdf, relationship: "derived_from" }], old_value: "$12.00", new_value: "$15.00", confidence: 0.9, recommended_action: "Update the menu PDF", origin: "rule" }];
    const proposals = [{ target_asset_id: assets.pdf, current_value: "$12.00", proposed_value: "$15.00", reason: "Menu.pdf shows the old price", evidence: [{ label: "Fact", detail: "Classic Burger price $12.00" }], impact_level: "high", origin: "rule" }];
    const r = await asUser(pool, founder, async (q) => (await q("select * from public.save_change_analysis($1,$2,$3,$4)", [change, JSON.stringify(impacts), JSON.stringify(proposals), JSON.stringify({ generatedBy: "rules" })])).rows[0]);
    expect(r).toEqual({ impacts_saved: 1, proposals_created: 1, proposals_kept: 0, new_status: "pending_approval" });
    const impact = await asUser(pool, founder, async (q) => (await q("select impact_level, recommended_action from public.change_impacts where change_id = $1", [change])).rows);
    expect(impact).toEqual([{ impact_level: "high", recommended_action: "Update the menu PDF" }]);
  });

  it("6. approves the update proposal (never auto-applied) and applies it", async () => {
    proposal = (await pool.query("select id from public.update_proposals where change_id = $1", [change])).rows[0].id;
    await asUser(pool, founder, (q) => q("select public.decide_update_proposal($1,'approved','Looks right')", [proposal]));
    expect((await pool.query("select approval_status, execution_status from public.update_proposals where id = $1", [proposal])).rows[0]).toEqual({ approval_status: "approved", execution_status: "ready" });
    const exec = await asUser(pool, founder, async (q) => (await q<{ execution_id: string }>("select * from public.start_proposal_execution($1,'execute','manual')", [proposal])).rows[0]!.execution_id);
    const status = await asUser(pool, founder, async (q) => (await q<{ s: string }>("select public.finish_proposal_execution($1, true, $2, null) as s", [exec, JSON.stringify({ note: "Uploaded new PDF" })])).rows[0]!.s);
    expect(status).toBe("completed");
    expect((await pool.query("select status from public.changes where id = $1", [change])).rows[0].status).toBe("completed");
  });

  it("7. invites a teammate who joins with the invited email", async () => {
    const tokenHash = "a".repeat(64);
    await asUser(pool, founder, (q) => q("insert into public.invitations (workspace_id, email, role, token_hash) values ($1,'sam@bistro.test','editor',$2)", [ws, tokenHash]));
    teammate = await createAuthUser(pool, "sam@bistro.test", "Sam");
    expect(await asUser(pool, teammate, async (q) => (await q<{ w: string }>("select public.accept_invitation($1) as w", [tokenHash])).rows[0]!.w)).toBe(ws);
    const visible = await asUser(pool, teammate, async (q) => (await q("select name from public.assets order by name")).rows.map((r) => r.name));
    expect(visible).toEqual(["Menu.pdf", "Price list.csv"]);
  });

  it("8. leaves a complete audit trail and usage counts", async () => {
    const { rows } = await pool.query("select action from public.audit_logs where workspace_id = $1 order by id", [ws]);
    const actions = rows.map((r) => r.action);
    for (const a of ["assets.insert", "asset_relationships.insert", "asset_relationships.update", "changes.insert", "update_proposals.insert", "approvals.insert", "invitations.insert", "invitations.update", "workspace_members.insert"]) {
      expect(actions).toContain(a);
    }
    const usage = await asUser(pool, founder, async (q) => (await q("select assets, workspaces, members, scans_this_month from public.organization_usage($1)", [org])).rows[0]);
    expect(usage).toEqual({ assets: 2, workspaces: 1, members: 2, scans_this_month: 2 });
  });
});

import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDatabase, expectDbError } from "./harness";

let pool: pg.Pool;
let owner: string;
let editor: string;
let viewer: string;
let ws: string;
let proposalId: string;
let relId: string;

beforeAll(async () => {
  pool = await createTestDatabase("changemesh_workflow_test");
  owner = await createAuthUser(pool, "owner@w.test");
  editor = await createAuthUser(pool, "editor@w.test");
  viewer = await createAuthUser(pool, "viewer@w.test");
  ws = await asUser(pool, owner, async (q) => (await q<{ workspace_id: string }>("select * from public.create_organization_with_workspace('W Org','w-org','Main','main')")).rows[0]!.workspace_id);
  await pool.query("insert into public.workspace_members (workspace_id, user_id, role) values ($1,$2,'editor'),($1,$3,'viewer')", [ws, editor, viewer]);
  await asUser(pool, editor, async (q) => {
    const a = (await q<{ id: string }>("insert into public.assets (workspace_id, type, name, created_by) values ($1,'manual','A',$2) returning id", [ws, owner])).rows[0]!.id;
    const b = (await q<{ id: string }>("insert into public.assets (workspace_id, type, name) values ($1,'manual','B') returning id", [ws])).rows[0]!.id;
    relId = (await q<{ id: string }>("insert into public.asset_relationships (workspace_id, source_asset_id, target_asset_id, relationship_type, status) values ($1,$2,$3,'references','suggested') returning id", [ws, a, b])).rows[0]!.id;
    const c = (await q<{ id: string }>("insert into public.changes (workspace_id, title, change_type) values ($1,'Price','updated') returning id", [ws])).rows[0]!.id;
    proposalId = (await q<{ id: string }>("insert into public.update_proposals (workspace_id, change_id, target_asset_id, impact_level) values ($1,$2,$3,'high') returning id", [ws, c, a])).rows[0]!.id;
  });
});

afterAll(async () => {
  await pool?.end();
});

describe("authorship stamping", () => {
  it("sets created_by to the real caller even if the client sends another id", async () => {
    const { rows } = await pool.query("select created_by from public.assets where name = 'A'");
    expect(rows[0]?.created_by).toBe(editor);
  });

  it("records who reviewed a relationship", async () => {
    await asUser(pool, editor, (q) => q("update public.asset_relationships set status = 'confirmed' where id = $1", [relId]));
    const { rows } = await pool.query("select reviewed_by, reviewed_at from public.asset_relationships where id = $1", [relId]);
    expect(rows[0]?.reviewed_by).toBe(editor);
    expect(rows[0]?.reviewed_at).not.toBeNull();
  });
});

describe("decide_update_proposal", () => {
  it("rejects editors and viewers", async () => {
    for (const who of [editor, viewer]) {
      const err = await expectDbError(asUser(pool, who, (q) => q("select public.decide_update_proposal($1, 'approved')", [proposalId])));
      expect(["42501", "P0001"]).toContain(err.code);
    }
  });

  it("requires a comment for rejections and revision requests", async () => {
    const err = await expectDbError(asUser(pool, owner, (q) => q("select public.decide_update_proposal($1, 'rejected', '  ')", [proposalId])));
    expect(err.message).toMatch(/comment is required/);
  });

  it("allows revision requests, then a final approval, recorded atomically", async () => {
    await asUser(pool, owner, (q) => q("select public.decide_update_proposal($1, 'needs_revision', 'Use the new photo')", [proposalId]));
    await asUser(pool, owner, (q) => q("select public.decide_update_proposal($1, 'approved', null)", [proposalId]));
    const { rows } = await pool.query("select decision, decided_by from public.approvals where proposal_id = $1 order by created_at, id", [proposalId]);
    expect(rows.map((r) => r.decision).sort()).toEqual(["approved", "needs_revision"]);
    expect(rows.every((r) => r.decided_by === owner)).toBe(true);
  });

  it("refuses to decide twice (no duplicate approvals)", async () => {
    const err = await expectDbError(asUser(pool, owner, (q) => q("select public.decide_update_proposal($1, 'rejected', 'late')", [proposalId])));
    expect(err.message).toMatch(/already been decided/);
    const { rows } = await pool.query("select count(*)::int n from public.approvals where proposal_id = $1", [proposalId]);
    expect(rows[0]?.n).toBe(2);
  });
});

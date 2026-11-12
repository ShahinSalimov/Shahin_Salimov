import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDatabase, expectDbError } from "./harness";

let pool: pg.Pool;
let editor: string;
let viewer: string;
let outsider: string;
let ws: string;
let a: string;
let b: string;
let c: string;
let foreignAsset: string;

const rel = (user: string, s: string, t: string, type = "references", status = "confirmed") =>
  asUser(pool, user, async (q) => (await q<{ id: string }>("insert into public.asset_relationships (workspace_id, source_asset_id, target_asset_id, relationship_type, status, origin, confidence) values ($1,$2,$3,$4,$5,'manual',1) returning id", [ws, s, t, type, status])).rows[0]!.id);

beforeAll(async () => {
  pool = await createTestDatabase("changemesh_graph_test");
  const owner = await createAuthUser(pool, "owner@graph.test");
  editor = await createAuthUser(pool, "editor@graph.test");
  viewer = await createAuthUser(pool, "viewer@graph.test");
  outsider = await createAuthUser(pool, "out@other.test");
  ws = await asUser(pool, owner, async (q) => (await q<{ workspace_id: string }>("select * from public.create_organization_with_workspace('Graph','graph','Main','main')")).rows[0]!.workspace_id);
  const other = await asUser(pool, outsider, async (q) => (await q<{ workspace_id: string }>("select * from public.create_organization_with_workspace('Other','other-g','Main','main')")).rows[0]!.workspace_id);
  await pool.query("insert into public.workspace_members (workspace_id, user_id, role) values ($1,$2,'editor'),($1,$3,'viewer')", [ws, editor, viewer]);
  [a, b, c] = await asUser(pool, editor, async (q) => {
    const ids: string[] = [];
    for (const n of ["Prices", "Menu page", "Archived"]) ids.push((await q<{ id: string }>("insert into public.assets (workspace_id, type, name) values ($1,'manual',$2) returning id", [ws, n])).rows[0]!.id);
    return ids as [string, string, string];
  });
  foreignAsset = await asUser(pool, outsider, async (q) => (await q<{ id: string }>("insert into public.assets (workspace_id, type, name) values ($1,'manual','Theirs') returning id", [other])).rows[0]!.id);
  await asUser(pool, editor, async (q) => {
    for (const [asset, v] of [[a, "$15"], [c, "$9"]] as const) {
      await q("insert into public.extracted_facts (workspace_id, asset_id, entity_name, attribute_name, value_text, normalized_value, confidence, method, origin) values ($1,$2,'Burger','price',$3,$3,1,'manual','manual')", [ws, asset, v]);
    }
    await q("update public.assets set status = 'archived' where id = $1", [c]);
  });
});

afterAll(async () => {
  await pool?.end();
});

describe("relationships", () => {
  it("lets editors create relationships and blocks reverse duplicates of the same type", async () => {
    await rel(editor, b, a, "derived_from");
    const dup = await expectDbError(rel(editor, a, b, "derived_from"));
    expect(dup.code).toBe("23505");
    await rel(editor, a, b, "links_to"); // a different type is a different relationship
  });

  it("rejects self-links, cross-tenant links and viewer writes", async () => {
    expect((await expectDbError(rel(editor, a, a))).code).toBe("23514");
    expect((await expectDbError(rel(editor, a, foreignAsset))).code).toBe("23503");
    expect((await expectDbError(rel(viewer, a, c))).code).toBe("42501");
  });

  it("keeps endpoints immutable", async () => {
    const id = await rel(editor, c, a, "references", "suggested");
    const err = await expectDbError(asUser(pool, editor, (q) => q("update public.asset_relationships set target_asset_id = $1 where id = $2", [b, id])));
    expect(err.message).toMatch(/immutable/);
    await asUser(pool, editor, (q) => q("update public.asset_relationships set status = 'rejected' where id = $1", [id]));
  });

  it("lets editors delete relationships", async () => {
    const id = await rel(editor, c, b, "references");
    const { rowCount } = await asUser(pool, editor, (q) => q("delete from public.asset_relationships where id = $1", [id]));
    expect(rowCount).toBe(1);
  });
});

describe("current_facts", () => {
  it("returns facts of active assets only and respects tenancy", async () => {
    const mine = await asUser(pool, viewer, (q) => q<{ asset_id: string }>("select asset_id from public.current_facts"));
    expect(mine.rows.map((r) => r.asset_id)).toEqual([a]); // archived asset c is excluded
    expect((await asUser(pool, outsider, (q) => q("select * from public.current_facts where workspace_id = $1", [ws]))).rowCount).toBe(0);
  });
});

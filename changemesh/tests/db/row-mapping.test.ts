import type pg from "pg";
import type { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as rows from "@/server/data/rows";
import { asUser, createAuthUser, createTestDatabase } from "./harness";

/**
 * Verifies that the Zod row schemas used by SupabaseWorkspaceData match the real
 * columns and JSON types produced by PostgreSQL (PostgREST serializes rows the
 * same way as to_jsonb). Catches renamed columns and enum drift.
 */
let pool: pg.Pool;
let ws: string;
let org: string;

beforeAll(async () => {
  pool = await createTestDatabase("changemesh_rows_test");
  const owner = await createAuthUser(pool, "owner@rows.test", "Olivia Owner");
  const ids = await asUser(pool, owner, async (q) => (await q<{ organization_id: string; workspace_id: string }>("select * from public.create_organization_with_workspace('Rows Org','rows-org','Main','main')")).rows[0]!);
  ws = ids.workspace_id;
  org = ids.organization_id;
  await asUser(pool, owner, async (q) => {
    const a = (await q<{ id: string }>("insert into public.assets (workspace_id, type, name, source_url, size_bytes, current_version) values ($1,'website','Menu','https://x.test',1234,2) returning id", [ws])).rows[0]!.id;
    const b = (await q<{ id: string }>("insert into public.assets (workspace_id, type, name) values ($1,'csv','Prices') returning id", [ws])).rows[0]!.id;
    await q("insert into public.asset_versions (workspace_id, asset_id, version, summary) values ($1,$2,1,'{\"note\":\"first\"}')", [ws, a]);
    await q("insert into public.asset_relationships (workspace_id, source_asset_id, target_asset_id, relationship_type, confidence) values ($1,$2,$3,'derived_from',0.875)", [ws, a, b]);
    const c = (await q<{ id: string }>("insert into public.changes (workspace_id, title, change_type, source_asset_id, old_value, new_value) values ($1,'Price','updated',$2,'12','15') returning id", [ws, b])).rows[0]!.id;
    const i = (
      await q<{ id: string }>(
        "insert into public.change_impacts (workspace_id, change_id, asset_id, impact_level, depth, relationship_path, confidence) values ($1,$2,$3,'high',1,$4,0.9) returning id",
        [ws, c, a, JSON.stringify([{ assetId: b, relationship: "contains" }, { assetId: a, relationship: "derived_from" }])],
      )
    ).rows[0]!.id;
    const p = (await q<{ id: string }>("insert into public.update_proposals (workspace_id, change_id, change_impact_id, target_asset_id, impact_level, evidence) values ($1,$2,$3,$4,'high','[{\"label\":\"Source\",\"detail\":\"Prices\"}]') returning id", [ws, c, i, a])).rows[0]!.id;
    await q("select public.decide_update_proposal($1,'approved',null)", [p]);
    await q("insert into public.integrations (workspace_id, provider, display_name) values ($1,'google_sheets','Sheets')", [ws]);
    const scan = (await q<{ id: string }>("select public.start_asset_scan($1, 'upload') as id", [b])).rows[0]!.id;
    await q("select * from public.record_scan_result($1,'partial','h1',$2,$3,$4,'Row 3 skipped',$5)", [
      scan,
      JSON.stringify({ kind: "csv" }),
      JSON.stringify([{ entity_name: "Burger", attribute_name: "price", value_text: "$15.00", value_number: 15, value_unit: "USD", normalized_value: "USD 15.00", source_location: { kind: "row", row: 2, column: "Price" }, confidence: 0.9, method: "csv" }]),
      JSON.stringify(["Row 3 skipped"]),
      JSON.stringify({ bytes: 120 }),
    ]);
    await q("insert into public.extracted_facts (workspace_id, asset_id, entity_name, attribute_name, value_text, normalized_value, confidence, method, origin) values ($1,$2,'Downtown','phone','+1 555 0142','+15550142',1,'manual','manual')", [ws, b]);
  });
  await pool.query("insert into public.subscriptions (organization_id, plan, status, current_period_end) values ($1,'business','trialing', now() + interval '10 days')", [org]);
});

afterAll(async () => {
  await pool?.end();
});

async function jsonRows(sql: string): Promise<unknown[]> {
  // Round-trip through JSON text exactly like an HTTP response body.
  const { rows: r } = await pool.query<{ j: unknown }>(sql, [ws]);
  return r.map((x) => JSON.parse(JSON.stringify(x.j)));
}

function expectAllParse(schema: z.ZodTypeAny, data: unknown[]) {
  expect(data.length).toBeGreaterThan(0);
  for (const row of data) {
    const parsed = schema.safeParse(row);
    expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 2))).toBe(true);
  }
}

describe("row schemas match the database", () => {
  it("assets, versions, relationships, changes", async () => {
    expectAllParse(rows.assetRow, await jsonRows("select to_jsonb(t) j from public.assets t where workspace_id = $1"));
    expectAllParse(rows.versionRow, await jsonRows("select to_jsonb(t) j from public.asset_versions t where workspace_id = $1"));
    expectAllParse(rows.relationshipRow, await jsonRows("select to_jsonb(t) j from public.asset_relationships t where workspace_id = $1"));
    expectAllParse(rows.changeRow, await jsonRows("select to_jsonb(t) j from public.changes t where workspace_id = $1"));
  });

  it("impacts keep their relationship path; proposals keep evidence", async () => {
    const impacts = await jsonRows("select to_jsonb(t) j from public.change_impacts t where workspace_id = $1");
    expectAllParse(rows.impactRow, impacts);
    expect(rows.impactRow.parse(impacts[0]).relationship_path).toHaveLength(2);
    const proposals = await jsonRows("select to_jsonb(t) j from public.update_proposals t where workspace_id = $1");
    expectAllParse(rows.proposalRow, proposals);
    expect(rows.proposalRow.parse(proposals[0]).evidence[0]?.label).toBe("Source");
  });

  it("embedded profile joins (approvals, audit, members)", async () => {
    expectAllParse(rows.approvalRow, await jsonRows("select to_jsonb(t) || jsonb_build_object('profiles', (select jsonb_build_object('full_name', p.full_name) from public.profiles p where p.id = t.decided_by)) j from public.approvals t where workspace_id = $1"));
    expectAllParse(rows.auditRow, await jsonRows("select to_jsonb(t) || jsonb_build_object('profiles', (select jsonb_build_object('full_name', p.full_name) from public.profiles p where p.id = t.actor_id)) j from public.audit_logs t where workspace_id = $1"));
    expectAllParse(rows.memberRow, await jsonRows("select to_jsonb(t) || jsonb_build_object('profiles', (select jsonb_build_object('full_name', p.full_name, 'email', p.email) from public.profiles p where p.id = t.user_id)) j from public.workspace_members t where workspace_id = $1"));
  });

  it("facts, scans and fact counts (Stage 3)", async () => {
    const facts = await jsonRows("select to_jsonb(t) j from public.extracted_facts t where workspace_id = $1");
    expectAllParse(rows.factRow, facts);
    expect(facts.map((f) => rows.factRow.parse(f).source_location.kind).sort()).toEqual(["manual", "row"]);
    const scans = await jsonRows("select to_jsonb(t) j from public.asset_scans t where workspace_id = $1");
    expectAllParse(rows.scanRow, scans);
    expect(rows.scanRow.parse(scans[0]).warnings).toEqual(["Row 3 skipped"]);
    expectAllParse(rows.factCountRow, await jsonRows("select to_jsonb(t) j from public.asset_fact_counts t where workspace_id = $1"));
  });

  it("integrations and subscriptions", async () => {
    expectAllParse(rows.integrationRow, await jsonRows("select to_jsonb(t) j from public.integrations t where workspace_id = $1"));
    expectAllParse(rows.subscriptionRow, await jsonRows("select to_jsonb(s) j from public.subscriptions s join public.workspaces w on w.organization_id = s.organization_id where w.id = $1"));
  });
});

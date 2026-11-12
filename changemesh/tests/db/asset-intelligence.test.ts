import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDatabase, expectDbError } from "./harness";

let pool: pg.Pool;
let editor: string;
let viewer: string;
let outsider: string;
let ws: string;
let asset: string;

const fact = (entity: string, attribute: string, value: string, extra: Record<string, unknown> = {}) => ({
  entity_name: entity,
  attribute_name: attribute,
  value_text: value,
  value_number: null,
  value_unit: null,
  normalized_value: value.toLowerCase(),
  source_location: { kind: "row", row: 1 },
  confidence: 0.9,
  method: "csv",
  ...extra,
});

async function record(scanId: string, status: string, hash: string | null, facts: unknown[], error: string | null = null) {
  return asUser(pool, editor, async (q) =>
    (
      await q<{ asset_version: number | null; new_version: boolean; facts_count: number }>(
        "select * from public.record_scan_result($1, $2, $3, $4, $5, $6, $7, $8)",
        [scanId, status, hash, JSON.stringify({ rows: facts.length }), JSON.stringify(facts), JSON.stringify([]), error, JSON.stringify({ bytes: 10 })],
      )
    ).rows[0]!,
  );
}

const start = () => asUser(pool, editor, async (q) => (await q<{ id: string }>("select public.start_asset_scan($1, 'upload') as id", [asset])).rows[0]!.id);

beforeAll(async () => {
  pool = await createTestDatabase("changemesh_intel_test");
  const owner = await createAuthUser(pool, "owner@intel.test");
  editor = await createAuthUser(pool, "editor@intel.test");
  viewer = await createAuthUser(pool, "viewer@intel.test");
  outsider = await createAuthUser(pool, "outsider@other.test");
  ws = await asUser(pool, owner, async (q) => (await q<{ workspace_id: string }>("select * from public.create_organization_with_workspace('Intel','intel','Main','main')")).rows[0]!.workspace_id);
  await asUser(pool, outsider, (q) => q("select * from public.create_organization_with_workspace('Other','other','Main','main')"));
  await pool.query("insert into public.workspace_members (workspace_id, user_id, role) values ($1,$2,'editor'),($1,$3,'viewer')", [ws, editor, viewer]);
  asset = await asUser(pool, editor, async (q) => (await q<{ id: string }>("insert into public.assets (workspace_id, type, name) values ($1,'csv','Prices') returning id", [ws])).rows[0]!.id);
});

afterAll(async () => {
  await pool?.end();
});

describe("scan lifecycle", () => {
  it("creates version 1 with its facts and marks the asset scanned", async () => {
    const scan = await start();
    const { rows: running } = await pool.query("select scan_status from public.assets where id = $1", [asset]);
    expect(running[0]?.scan_status).toBe("running");
    const r = await record(scan, "succeeded", "hash-a", [fact("Classic Burger", "price", "$12.00"), fact("Pumpkin Risotto", "price", "$19.00")]);
    expect(r).toEqual({ asset_version: 1, new_version: true, facts_count: 2 });
    const { rows } = await pool.query("select scan_status, current_version, last_scanned_at is not null scanned from public.assets where id = $1", [asset]);
    expect(rows[0]).toEqual({ scan_status: "succeeded", current_version: 1, scanned: true });
  });

  it("does not create a new version when the content is unchanged", async () => {
    const r = await record(await start(), "succeeded", "hash-a", [fact("Classic Burger", "price", "$12.00")]);
    expect(r).toEqual({ asset_version: 1, new_version: false, facts_count: 2 });
  });

  it("creates a new version for changed content and keeps old facts as history", async () => {
    const r = await record(await start(), "partial", "hash-b", [fact("Classic Burger", "price", "$15.00")], "Rows 4-5 were malformed and skipped.");
    expect(r).toEqual({ asset_version: 2, new_version: true, facts_count: 1 });
    const { rows } = await pool.query("select asset_version, count(*)::int n from public.extracted_facts where asset_id = $1 group by 1 order by 1", [asset]);
    expect(rows).toEqual([{ asset_version: 1, n: 2 }, { asset_version: 2, n: 1 }]);
    const a = await pool.query("select scan_status, last_scan_error from public.assets where id = $1", [asset]);
    expect(a.rows[0]).toEqual({ scan_status: "partial", last_scan_error: "Rows 4-5 were malformed and skipped." });
  });

  it("records failures honestly and keeps the previous version", async () => {
    const scan = await start();
    const err = await expectDbError(record(scan, "failed", null, []));
    expect(err.message).toMatch(/needs an error message/);
    const r = await record(scan, "failed", null, [], "File is not valid UTF-8 text.");
    expect(r).toEqual({ asset_version: 2, new_version: false, facts_count: 0 });
    const { rows } = await pool.query("select scan_status, current_version, last_scan_error from public.assets where id = $1", [asset]);
    expect(rows[0]).toEqual({ scan_status: "failed", current_version: 2, last_scan_error: "File is not valid UTF-8 text." });
    const s = await pool.query("select status, asset_version, error from public.asset_scans where id = $1", [scan]);
    expect(s.rows[0]).toEqual({ status: "failed", asset_version: null, error: "File is not valid UTF-8 text." });
  });

  it("refuses to finish a scan twice", async () => {
    const scan = await start();
    await record(scan, "succeeded", "hash-b", []);
    const err = await expectDbError(record(scan, "succeeded", "hash-c", []));
    expect(err.message).toMatch(/already finished/);
  });

  it("allows only one running scan per asset and closes stale ones", async () => {
    const scan = await start();
    const err = await expectDbError(start());
    expect(err.message).toMatch(/already running/);
    await pool.query("update public.asset_scans set started_at = now() - interval '10 minutes' where id = $1", [scan]);
    const next = await start();
    const { rows } = await pool.query("select status, error from public.asset_scans where id = $1", [scan]);
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.error).toMatch(/did not finish/);
    await record(next, "succeeded", "hash-b", []);
  });

  it("caps the number of facts per scan", async () => {
    const scan = await start();
    const many = Array.from({ length: 5001 }, (_, i) => fact(`Item ${i}`, "price", "1"));
    const err = await expectDbError(record(scan, "succeeded", "hash-z", many));
    expect(err.message).toMatch(/Too many facts/);
    await record(scan, "failed", null, [], "aborted");
  });
});

describe("facts", () => {
  it("counts only current-version and manual facts", async () => {
    await asUser(pool, editor, (q) =>
      q("insert into public.extracted_facts (workspace_id, asset_id, entity_name, attribute_name, value_text, normalized_value, confidence, method, origin) values ($1,$2,'Downtown','phone','+1 555 0142','+15550142',1,'manual','manual')", [ws, asset]),
    );
    const { rows } = await asUser(pool, viewer, (q) => q("select facts_count from public.asset_fact_counts where asset_id = $1", [asset]));
    expect(rows[0]?.facts_count).toBe(2); // 1 fact of version 2 + 1 manual
  });

  it("requires manual facts to be unversioned and scanned facts to be versioned", async () => {
    const err = await expectDbError(
      asUser(pool, editor, (q) => q("insert into public.extracted_facts (workspace_id, asset_id, asset_version, entity_name, attribute_name, value_text, normalized_value, confidence, method) values ($1,$2,2,'X','y','z','z',1,'manual')", [ws, asset])),
    );
    expect(err.code).toBe("23514");
  });

  it("audits manual facts with the acting user", async () => {
    const { rows } = await pool.query("select actor_id from public.audit_logs where action = 'extracted_facts.insert' order by id desc limit 1");
    expect(rows[0]?.actor_id).toBe(editor);
  });
});

describe("access control", () => {
  it("lets viewers read facts and scans but not start scans or add facts", async () => {
    await asUser(pool, viewer, async (q) => {
      expect((await q("select id from public.extracted_facts where asset_id = $1", [asset])).rowCount).toBeGreaterThan(0);
      expect((await q("select id from public.asset_scans where asset_id = $1", [asset])).rowCount).toBeGreaterThan(0);
    });
    const err = await expectDbError(asUser(pool, viewer, (q) => q("select public.start_asset_scan($1, 'upload')", [asset])));
    expect(["42501", "P0001"]).toContain(err.code);
    const err2 = await expectDbError(
      asUser(pool, viewer, (q) => q("insert into public.extracted_facts (workspace_id, asset_id, entity_name, attribute_name, value_text, normalized_value, confidence, method) values ($1,$2,'X','y','z','z',1,'manual')", [ws, asset])),
    );
    expect(err2.code).toBe("42501");
  });

  it("hides facts, scans and counts from other tenants", async () => {
    await asUser(pool, outsider, async (q) => {
      expect((await q("select id from public.extracted_facts")).rowCount).toBe(0);
      expect((await q("select id from public.asset_scans")).rowCount).toBe(0);
      expect((await q("select * from public.asset_fact_counts")).rowCount).toBe(0);
    });
    const err = await expectDbError(asUser(pool, outsider, (q) => q("select public.start_asset_scan($1, 'upload')", [asset])));
    expect(err.message).toMatch(/Asset not found/);
  });

  it("does not let other tenants finish someone else's scan", async () => {
    const scan = await start();
    const err = await expectDbError(
      asUser(pool, outsider, (q) => q("select * from public.record_scan_result($1,'succeeded','h','{}','[]','[]',null,'{}')", [scan])),
    );
    expect(err.message).toMatch(/Scan not found/);
    await record(scan, "failed", null, [], "cleanup");
  });

  it("deleting an asset removes its facts, scans and versions", async () => {
    await asUser(pool, editor, (q) => q("delete from public.assets where id = $1", [asset]));
    for (const t of ["extracted_facts", "asset_scans", "asset_versions"]) {
      const { rows } = await pool.query(`select count(*)::int n from public.${t} where asset_id = $1`, [asset]);
      expect(rows[0]?.n, t).toBe(0);
    }
  });
});

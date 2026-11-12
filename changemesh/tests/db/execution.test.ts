import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDatabase, expectDbError } from "./harness";

let pool: pg.Pool;
let owner: string;
let editor: string;
let viewer: string;
let ws: string;
let change: string;
let p1: string;
let p2: string;

const status = async (id: string) => (await pool.query("select approval_status, execution_status, execution_attempts from public.update_proposals where id = $1", [id])).rows[0];
const changeStatus = async () => (await pool.query("select status from public.changes where id = $1", [change])).rows[0].status;
const start = (user: string, id: string, action = "execute", mode = "internal") =>
  asUser(pool, user, async (q) => (await q<{ execution_id: string; idempotency_key: string; attempt: number }>("select * from public.start_proposal_execution($1, $2, $3)", [id, action, mode])).rows[0]!);
const finish = (user: string, exec: string, ok: boolean, error: string | null = null) =>
  asUser(pool, user, async (q) => (await q<{ s: string }>("select public.finish_proposal_execution($1, $2, $3, $4) as s", [exec, ok, JSON.stringify({ note: "test" }), error])).rows[0]!.s);

beforeAll(async () => {
  pool = await createTestDatabase("changemesh_exec_test");
  owner = await createAuthUser(pool, "owner@x.test");
  editor = await createAuthUser(pool, "editor@x.test");
  viewer = await createAuthUser(pool, "viewer@x.test");
  ws = await asUser(pool, owner, async (q) => (await q<{ workspace_id: string }>("select * from public.create_organization_with_workspace('Exec Org','x-exec','Main','main')")).rows[0]!.workspace_id);
  await pool.query("insert into public.workspace_members (workspace_id, user_id, role) values ($1,$2,'editor'),($1,$3,'viewer')", [ws, editor, viewer]);
  await asUser(pool, editor, async (q) => {
    const a = (await q<{ id: string }>("insert into public.assets (workspace_id, type, name) values ($1,'manual','Menu') returning id", [ws])).rows[0]!.id;
    const b = (await q<{ id: string }>("insert into public.assets (workspace_id, type, name) values ($1,'manual','PDF') returning id", [ws])).rows[0]!.id;
    change = (await q<{ id: string }>("insert into public.changes (workspace_id, title, change_type, status) values ($1,'Price','updated','pending_approval') returning id", [ws])).rows[0]!.id;
    p1 = (await q<{ id: string }>("insert into public.update_proposals (workspace_id, change_id, target_asset_id, current_value, proposed_value, impact_level) values ($1,$2,$3,'$12','$15','high') returning id", [ws, change, a])).rows[0]!.id;
    p2 = (await q<{ id: string }>("insert into public.update_proposals (workspace_id, change_id, target_asset_id, current_value, proposed_value, impact_level) values ($1,$2,$3,'$12','$51','low') returning id", [ws, change, b])).rows[0]!.id;
  });
});

afterAll(async () => {
  await pool?.end();
});

describe("revision loop", () => {
  it("lets editors revise a proposal that needs revision and sends it back to pending", async () => {
    await asUser(pool, owner, (q) => q("select public.decide_update_proposal($1, 'needs_revision', 'Typo in the price')", [p2]));
    expect(await changeStatus()).toBe("pending_approval");
    const err = await expectDbError(asUser(pool, editor, (q) => q("select public.revise_update_proposal($1, '$15', 'Fixed', '  ')", [p2])));
    expect(err.message).toMatch(/Describe what you changed/);
    await asUser(pool, editor, (q) => q("select public.revise_update_proposal($1, '$15', 'Fixed the typo', 'Corrected $51 to $15')", [p2]));
    const { rows } = await pool.query("select approval_status, proposed_value, revision_count, evidence from public.update_proposals where id = $1", [p2]);
    expect(rows[0]).toMatchObject({ approval_status: "pending", proposed_value: "$15", revision_count: 1 });
    expect(JSON.stringify(rows[0].evidence)).toContain("Corrected $51 to $15");
  });

  it("does not let editors use revision to approve, and refuses revising pending proposals", async () => {
    expect((await expectDbError(asUser(pool, editor, (q) => q("update public.update_proposals set approval_status = 'approved' where id = $1", [p1])))).code).toBe("42501");
    expect((await expectDbError(asUser(pool, editor, (q) => q("select public.revise_update_proposal($1, 'x', 'y', 'z')", [p1])))).message).toMatch(/Only proposals that need a revision/);
  });
});

describe("execution", () => {
  it("cannot execute before approval", async () => {
    expect((await expectDbError(start(owner, p1))).message).toMatch(/Only approved proposals/);
  });

  it("approval marks the update ready, never completed", async () => {
    await asUser(pool, owner, (q) => q("select public.decide_update_proposal($1, 'approved', null)", [p1]));
    expect(await status(p1)).toEqual({ approval_status: "approved", execution_status: "ready", execution_attempts: 0 });
  });

  it("is admin-only", async () => {
    expect((await expectDbError(start(editor, p1))).code).toBe("42501");
    expect((await expectDbError(start(viewer, p1))).code).toMatch(/42501|P0001/);
  });

  it("prevents duplicate execution while one is running and reuses the idempotency key on retry", async () => {
    const first = await start(owner, p1);
    expect(first.attempt).toBe(1);
    expect((await expectDbError(start(owner, p1))).message).toMatch(/in progress and cannot be executed again/);
    expect(await finish(owner, first.execution_id, false, "Target unreachable")).toBe("failed");
    expect((await expectDbError(finish(owner, first.execution_id, true))).message).toMatch(/already finished/);
    const retry = await start(owner, p1);
    expect(retry).toMatchObject({ attempt: 2, idempotency_key: first.idempotency_key });
    expect(await finish(owner, retry.execution_id, true)).toBe("completed");
    expect((await expectDbError(start(owner, p1))).message).toMatch(/completed and cannot be executed again/);
  });

  it("requires an error message for failures", async () => {
    await asUser(pool, owner, (q) => q("select public.decide_update_proposal($1, 'approved', null)", [p2]));
    const e = await start(owner, p2);
    expect((await expectDbError(finish(owner, e.execution_id, false, ""))).message).toMatch(/needs an error message/);
    await finish(owner, e.execution_id, true);
  });

  it("moves the change to completed when every approved update is done", async () => {
    expect(await changeStatus()).toBe("completed");
  });

  it("rolls back completed updates to ready and reopens the change", async () => {
    const r = await start(owner, p1, "rollback");
    expect(await finish(owner, r.execution_id, true)).toBe("ready");
    expect(await status(p1)).toMatchObject({ execution_status: "ready" });
    expect(await changeStatus()).toBe("approved");
    expect((await expectDbError(start(owner, p1, "rollback"))).message).toMatch(/Only completed updates can be rolled back/);
  });

  it("closes executions stuck in progress for more than 10 minutes", async () => {
    const e = await start(owner, p1);
    await pool.query("update public.update_executions set started_at = now() - interval '11 minutes' where id = $1", [e.execution_id]);
    const again = await start(owner, p1);
    const { rows } = await pool.query("select status, error from public.update_executions where id = $1", [e.execution_id]);
    expect(rows[0].status).toBe("failed");
    expect(rows[0].error).toMatch(/did not finish/);
    await finish(owner, again.execution_id, true);
  });

  it("records every execution in the history and the audit log", async () => {
    const { rows } = await pool.query("select action, status from public.update_executions where proposal_id = $1 and action <> 'simulate' order by attempt", [p1]);
    expect(rows.map((r) => `${r.action}:${r.status}`)).toEqual(["execute:failed", "execute:succeeded", "rollback:succeeded", "execute:failed", "execute:succeeded"]);
    const audit = await pool.query("select count(*)::int n from public.audit_logs where action like 'update_executions.%'");
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(10);
  });

  it("lets editors record simulations but not executions", async () => {
    await asUser(pool, editor, (q) => q("insert into public.update_executions (workspace_id, proposal_id, action, mode, status, idempotency_key, result) values ($1,$2,'simulate','simulation','succeeded','k','{}')", [ws, p1]));
    expect((await expectDbError(asUser(pool, editor, (q) => q("insert into public.update_executions (workspace_id, proposal_id, action, mode, status, idempotency_key) values ($1,$2,'execute','internal','succeeded','k')", [ws, p1])))).code).toBe("42501");
  });
});

describe("rejection", () => {
  it("marks the change rejected when all proposals are rejected", async () => {
    const { change: c2, p } = await asUser(pool, editor, async (q) => {
      const a = (await q<{ id: string }>("insert into public.assets (workspace_id, type, name) values ($1,'manual','Z') returning id", [ws])).rows[0]!.id;
      const c = (await q<{ id: string }>("insert into public.changes (workspace_id, title, change_type, status) values ($1,'Other','updated','pending_approval') returning id", [ws])).rows[0]!.id;
      const pp = (await q<{ id: string }>("insert into public.update_proposals (workspace_id, change_id, target_asset_id, impact_level) values ($1,$2,$3,'low') returning id", [ws, c, a])).rows[0]!.id;
      return { change: c, p: pp };
    });
    await asUser(pool, owner, (q) => q("select public.decide_update_proposal($1, 'rejected', 'Not needed')", [p]));
    expect((await pool.query("select status from public.changes where id = $1", [c2])).rows[0].status).toBe("rejected");
  });
});

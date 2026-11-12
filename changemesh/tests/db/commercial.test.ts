import { createHash } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDatabase, expectDbError } from "./harness";

let pool: pg.Pool;
let owner: string;
let invitee: string;
let stranger: string;
let editor: string;
let org: string;
let ws: string;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

beforeAll(async () => {
  pool = await createTestDatabase("changemesh_commercial_test");
  owner = await createAuthUser(pool, "owner@c.test");
  invitee = await createAuthUser(pool, "Invitee@C.test");
  stranger = await createAuthUser(pool, "stranger@c.test");
  editor = await createAuthUser(pool, "editor@c.test");
  const row = await asUser(pool, owner, async (q) => (await q<{ organization_id: string; workspace_id: string }>("select * from public.create_organization_with_workspace('Commerce Org','c-org','Main','main')")).rows[0]!);
  org = row.organization_id;
  ws = row.workspace_id;
  await pool.query("insert into public.organization_members (organization_id, user_id, role) values ($1,$2,'member')", [org, editor]);
  await pool.query("insert into public.workspace_members (workspace_id, user_id, role) values ($1,$2,'editor')", [ws, editor]);
});

afterAll(async () => {
  await pool?.end();
});

describe("plan limits", () => {
  it("applies Starter limits without a subscription", async () => {
    const lim = await asUser(pool, owner, async (q) => (await q("select * from public.organization_limits($1)", [org])).rows[0]);
    expect(lim).toEqual({ plan: "starter", assets_limit: 25, workspaces_limit: 1 });
  });

  it("refuses a second workspace on Starter", async () => {
    const err = await expectDbError(asUser(pool, owner, (q) => q("insert into public.workspaces (organization_id, name, slug, created_by) values ($1,'Second','second',$2)", [org, owner])));
    expect(err.message).toMatch(/Plan limit reached: your starter plan includes 1 workspace/);
  });

  it("refuses the 26th active asset on Starter, counts only active assets, and blocks un-archiving over the limit", async () => {
    await asUser(pool, editor, async (q) => {
      for (let i = 0; i < 25; i += 1) await q("insert into public.assets (workspace_id, type, name) values ($1,'manual',$2)", [ws, `A${i}`]);
    });
    const err = await expectDbError(asUser(pool, editor, (q) => q("insert into public.assets (workspace_id, type, name) values ($1,'manual','Too many')", [ws])));
    expect(err.message).toMatch(/25 assets/);
    // Archived assets do not count.
    await asUser(pool, editor, (q) => q("update public.assets set status = 'archived' where workspace_id = $1 and name = 'A0'", [ws]));
    await asUser(pool, editor, (q) => q("insert into public.assets (workspace_id, type, name) values ($1,'manual','Replacement')", [ws]));
    const restore = await expectDbError(asUser(pool, editor, (q) => q("update public.assets set status = 'active' where workspace_id = $1 and name = 'A0'", [ws])));
    expect(restore.message).toMatch(/Plan limit reached/);
  });

  it("raises limits once the billing webhook records an active Business subscription", async () => {
    await pool.query("insert into public.subscriptions (organization_id, plan, status) values ($1,'business','active')", [org]);
    await asUser(pool, editor, (q) => q("insert into public.assets (workspace_id, type, name) values ($1,'manual','Now allowed')", [ws]));
    await asUser(pool, owner, (q) => q("insert into public.workspaces (organization_id, name, slug, created_by) values ($1,'Second','second',$2)", [org, owner]));
    // A canceled subscription falls back to Starter limits.
    await pool.query("update public.subscriptions set status = 'canceled' where organization_id = $1", [org]);
    const lim = await asUser(pool, owner, async (q) => (await q("select plan from public.organization_limits($1)", [org])).rows[0]);
    expect(lim.plan).toBe("starter");
    await pool.query("update public.subscriptions set status = 'active' where organization_id = $1", [org]);
  });

  it("does not let members write subscriptions", async () => {
    const err = await expectDbError(asUser(pool, owner, (q) => q("update public.subscriptions set plan = 'enterprise' where organization_id = $1", [org])));
    expect(err.code).toBe("42501");
  });
});

describe("invitations", () => {
  const token = "invite-token-1234567890";

  it("only admins can create invitations; invited_by is stamped from the JWT", async () => {
    expect((await expectDbError(asUser(pool, editor, (q) => q("insert into public.invitations (workspace_id, email, role, token_hash) values ($1,'x@c.test','viewer',$2)", [ws, hash("e")])))).code).toBe("42501");
    await asUser(pool, owner, (q) => q("insert into public.invitations (workspace_id, email, role, token_hash, invited_by) values ($1,'invitee@c.test','editor',$2,$3)", [ws, hash(token), stranger]));
    const { rows } = await pool.query("select invited_by from public.invitations where token_hash = $1", [hash(token)]);
    expect(rows[0].invited_by).toBe(owner);
  });

  it("cannot invite an owner and allows one open invitation per email", async () => {
    expect((await expectDbError(asUser(pool, owner, (q) => q("insert into public.invitations (workspace_id, email, role, token_hash) values ($1,'o@c.test','owner',$2)", [ws, hash("o")])))).code).toBe("23514");
    expect((await expectDbError(asUser(pool, owner, (q) => q("insert into public.invitations (workspace_id, email, role, token_hash) values ($1,'INVITEE@c.test','viewer',$2)", [ws, hash("dup")])))).code).toBe("23505");
  });

  it("previews the invitation for the link holder only", async () => {
    const preview = await asUser(pool, stranger, async (q) => (await q("select * from public.invitation_preview($1)", [hash(token)])).rows);
    expect(preview).toEqual([{ workspace_name: "Main", organization_name: "Commerce Org", role: "editor", email: "invitee@c.test", status: "open" }]);
    expect(await asUser(pool, stranger, async (q) => (await q("select * from public.invitation_preview($1)", [hash("nope")])).rows)).toEqual([]);
    // Non-admins cannot list invitations.
    expect(await asUser(pool, stranger, async (q) => (await q("select id from public.invitations")).rows)).toEqual([]);
  });

  it("refuses acceptance by a different email address", async () => {
    const err = await expectDbError(asUser(pool, stranger, (q) => q("select public.accept_invitation($1)", [hash(token)])));
    expect(err.message).toMatch(/different email/);
  });

  it("accepts for the invited email (case-insensitive), joins the workspace and notifies the inviter", async () => {
    const wsId = await asUser(pool, invitee, async (q) => (await q<{ a: string }>("select public.accept_invitation($1) as a", [hash(token)])).rows[0]!.a);
    expect(wsId).toBe(ws);
    const { rows } = await pool.query("select role from public.workspace_members where workspace_id = $1 and user_id = $2", [ws, invitee]);
    expect(rows[0].role).toBe("editor");
    const again = await expectDbError(asUser(pool, invitee, (q) => q("select public.accept_invitation($1)", [hash(token)])));
    expect(again.message).toMatch(/already used/);
    const notes = await asUser(pool, owner, async (q) => (await q("select kind, title from public.notifications")).rows);
    expect(notes).toContainEqual({ kind: "invitation_accepted", title: "Invitation accepted" });
  });

  it("refuses expired and revoked invitations; accepted ones cannot be revoked", async () => {
    await asUser(pool, owner, (q) => q("insert into public.invitations (workspace_id, email, role, token_hash) values ($1,'stranger@c.test','viewer',$2)", [ws, hash("revoke-me")]));
    await asUser(pool, owner, (q) => q("update public.invitations set revoked_at = now() where token_hash = $1", [hash("revoke-me")]));
    expect((await expectDbError(asUser(pool, stranger, (q) => q("select public.accept_invitation($1)", [hash("revoke-me")])))).message).toMatch(/revoked/);

    await pool.query("insert into public.invitations (workspace_id, email, role, token_hash, expires_at) values ($1,'stranger@c.test','viewer',$2, now() - interval '1 day')", [ws, hash("old")]);
    expect((await expectDbError(asUser(pool, stranger, (q) => q("select public.accept_invitation($1)", [hash("old")])))).message).toMatch(/expired/);

    const updated = await asUser(pool, owner, async (q) => (await q("update public.invitations set revoked_at = now() where token_hash = $1 returning id", [hash(token)])).rowCount);
    expect(updated).toBe(0);
    // Admins cannot rewrite the token or email of an invitation.
    expect((await expectDbError(asUser(pool, owner, (q) => q("update public.invitations set email = 'x@y.test' where token_hash = $1", [hash("old")])))).code).toBe("42501");
  });

  it("requires a signed-in user", async () => {
    expect((await expectDbError(asUser(pool, null, (q) => q("select public.accept_invitation($1)", [hash(token)])))).code).toBe("42501");
  });
});

describe("notifications", () => {
  it("notifies admins (not the actor) when a change needs approval; users only see their own", async () => {
    const changeId = await asUser(pool, editor, async (q) => (await q<{ id: string }>("insert into public.changes (workspace_id, title, change_type, status) values ($1,'New price','updated','analyzed') returning id", [ws])).rows[0]!.id);
    await asUser(pool, editor, (q) => q("update public.changes set status = 'pending_approval' where id = $1", [changeId]));
    const ownerNotes = await asUser(pool, owner, async (q) => (await q("select kind, link from public.notifications where kind = 'approval_needed'")).rows);
    expect(ownerNotes).toEqual([{ kind: "approval_needed", link: `/w/${ws}/approvals` }]);
    const editorNotes = await asUser(pool, editor, async (q) => (await q("select kind from public.notifications where kind = 'approval_needed'")).rows);
    expect(editorNotes).toEqual([]);
  });

  it("notifies editors when a scan fails", async () => {
    const asset = (await pool.query("select id from public.assets where workspace_id = $1 and name = 'A1'", [ws])).rows[0].id;
    await pool.query("update public.assets set scan_status = 'failed', last_scan_error = 'Timeout' where id = $1", [asset]);
    const rows = await asUser(pool, editor, async (q) => (await q("select title, body from public.notifications where kind = 'scan_failed'")).rows);
    expect(rows).toEqual([{ title: "A scan failed: A1", body: "Timeout" }]);
  });

  it("lets users mark only read_at on their own notifications", async () => {
    const n = await asUser(pool, owner, async (q) => (await q("update public.notifications set read_at = now() returning id")).rowCount);
    expect(n).toBeGreaterThan(0);
    expect((await expectDbError(asUser(pool, owner, (q) => q("update public.notifications set title = 'x'")))).code).toBe("42501");
    expect((await expectDbError(asUser(pool, owner, (q) => q("insert into public.notifications (user_id, kind, title) values ($1,'scan_failed','x')", [owner])))).code).toBe("42501");
  });

  it("notifies org admins when Stripe reports a payment problem", async () => {
    await pool.query("update public.subscriptions set status = 'past_due' where organization_id = $1", [org]);
    const rows = await asUser(pool, owner, async (q) => (await q("select title from public.notifications where kind = 'payment_problem'")).rows);
    expect(rows).toEqual([{ title: "Payment problem" }]);
    expect(await asUser(pool, editor, async (q) => (await q("select id from public.notifications where kind = 'payment_problem'")).rows)).toEqual([]);
  });
});

describe("api keys", () => {
  it("are admin-only, scoped, and only revocable (hash is immutable)", async () => {
    expect((await expectDbError(asUser(pool, editor, (q) => q("insert into public.api_keys (workspace_id, name, prefix, key_hash) values ($1,'CI','cm_abcdefgh',$2)", [ws, hash("k0")])))).code).toBe("42501");
    await asUser(pool, owner, (q) => q("insert into public.api_keys (workspace_id, name, prefix, key_hash, scopes) values ($1,'CI','cm_abcdefgh',$2, array['read','write'])", [ws, hash("k1")]));
    expect((await expectDbError(asUser(pool, owner, (q) => q("insert into public.api_keys (workspace_id, name, prefix, key_hash, scopes) values ($1,'Bad','cm_abcdefgi',$2, array['admin'])", [ws, hash("k2")])))).code).toBe("23514");
    expect((await expectDbError(asUser(pool, owner, (q) => q("update public.api_keys set key_hash = $1", [hash("k3")])))).code).toBe("42501");
    await asUser(pool, owner, (q) => q("update public.api_keys set revoked_at = now()"));
    const audit = await pool.query("select action from public.audit_logs where target_type = 'api_keys' order by id");
    expect(audit.rows.map((r) => r.action)).toEqual(["api_keys.insert", "api_keys.update"]);
  });
});

describe("stripe events", () => {
  it("are invisible to signed-in users", async () => {
    await pool.query("insert into public.stripe_events (id, type) values ('evt_1','checkout.session.completed')");
    expect((await expectDbError(asUser(pool, owner, (q) => q("select * from public.stripe_events")))).code).toBe("42501");
  });
});

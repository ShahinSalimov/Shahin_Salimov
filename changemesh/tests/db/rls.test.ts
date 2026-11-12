import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDatabase, expectDbError } from "./harness";

let pool: pg.Pool;
let alice: string; // owner of Acme
let bob: string; // owner of Globex (other tenant)
let erin: string; // editor in Acme
let vic: string; // viewer in Acme
let adam: string; // admin in Acme
let acmeOrg: string;
let acmeWs: string;
let globexWs: string;
let globexAsset: string;

async function onboard(userId: string, org: string, slug: string) {
  return asUser(pool, userId, async (q) => {
    const { rows } = await q<{ organization_id: string; workspace_id: string }>(
      "select * from public.create_organization_with_workspace($1, $2, $3, $4)",
      [org, slug, "Main", "main"],
    );
    return rows[0]!;
  });
}

async function addMember(ws: string, user: string, role: string) {
  // Membership rows are created by trusted server code (service role), never by clients.
  await pool.query("insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, $3)", [ws, user, role]);
}

beforeAll(async () => {
  pool = await createTestDatabase("changemesh_rls_test");
  alice = await createAuthUser(pool, "alice@acme.test");
  bob = await createAuthUser(pool, "bob@globex.test");
  erin = await createAuthUser(pool, "erin@acme.test");
  vic = await createAuthUser(pool, "vic@acme.test");
  adam = await createAuthUser(pool, "adam@acme.test");
  const acme = await onboard(alice, "Acme", "acme");
  acmeOrg = acme.organization_id;
  acmeWs = acme.workspace_id;
  globexWs = (await onboard(bob, "Globex", "globex")).workspace_id;
  await addMember(acmeWs, erin, "editor");
  await addMember(acmeWs, vic, "viewer");
  await addMember(acmeWs, adam, "admin");
  globexAsset = await asUser(pool, bob, async (q) => {
    const { rows } = await q<{ id: string }>(
      "insert into public.assets (workspace_id, type, name, source_url, created_by) values ($1, 'website', 'Globex site', 'https://globex.test', $2) returning id",
      [globexWs, bob],
    );
    return rows[0]!.id;
  });
});

afterAll(async () => {
  await pool?.end();
});

describe("profiles", () => {
  it("are created automatically for new auth users", async () => {
    const { rows } = await pool.query("select email from public.profiles where id = $1", [alice]);
    expect(rows[0]?.email).toBe("alice@acme.test");
  });

  it("are visible only to people who share a workspace", async () => {
    const visible = await asUser(pool, alice, (q) => q("select id from public.profiles"));
    const ids = visible.rows.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([alice, erin, vic, adam]));
    expect(ids).not.toContain(bob);
  });

  it("cannot be escalated to platform admin by the user", async () => {
    const err = await expectDbError(asUser(pool, alice, (q) => q("update public.profiles set is_platform_admin = true where id = $1", [alice])));
    expect(err.code).toBe("42501");
  });
});

describe("onboarding RPC", () => {
  it("makes the caller organization owner and workspace owner", async () => {
    const { rows } = await pool.query(
      "select (select role from public.organization_members where organization_id = $1 and user_id = $2) org_role, (select role from public.workspace_members where workspace_id = $3 and user_id = $2) ws_role",
      [acmeOrg, alice, acmeWs],
    );
    expect(rows[0]).toEqual({ org_role: "owner", ws_role: "owner" });
  });

  it("rejects anonymous callers", async () => {
    const err = await expectDbError(asUser(pool, null, (q) => q("select * from public.create_organization_with_workspace('X Org','x-org','Main','main')")));
    expect(err.code).toBe("42501");
  });

  it("rejects duplicate organization slugs", async () => {
    const err = await expectDbError(asUser(pool, bob, (q) => q("select * from public.create_organization_with_workspace('Acme 2','acme','Main','main')")));
    expect(err.code).toBe("23505");
  });
});

describe("multi-tenant isolation", () => {
  it("hides other tenants' workspaces, assets and organizations", async () => {
    await asUser(pool, alice, async (q) => {
      const ws = await q("select id from public.workspaces");
      expect(ws.rows.map((r) => r.id)).toEqual([acmeWs]);
      const assets = await q("select id from public.assets where id = $1", [globexAsset]);
      expect(assets.rowCount).toBe(0);
      const orgs = await q("select id from public.organizations");
      expect(orgs.rows.map((r) => r.id)).toEqual([acmeOrg]);
    });
  });

  it("prevents writing into another tenant's workspace", async () => {
    const err = await expectDbError(
      asUser(pool, alice, (q) => q("insert into public.assets (workspace_id, type, name) values ($1, 'manual', 'Injected')", [globexWs])),
    );
    expect(err.code).toBe("42501");
  });

  it("silently affects zero rows when updating or deleting another tenant's data", async () => {
    await asUser(pool, alice, async (q) => {
      expect((await q("update public.assets set name = 'pwned' where id = $1", [globexAsset])).rowCount).toBe(0);
      expect((await q("delete from public.assets where id = $1", [globexAsset])).rowCount).toBe(0);
    });
    const { rows } = await pool.query("select name from public.assets where id = $1", [globexAsset]);
    expect(rows[0]?.name).toBe("Globex site");
  });

  it("blocks cross-tenant references via composite foreign keys", async () => {
    // Alice tries to link her workspace to Globex's asset (even if she guessed its id).
    const acmeAsset = await asUser(pool, alice, async (q) => {
      const { rows } = await q<{ id: string }>("insert into public.assets (workspace_id, type, name) values ($1, 'manual', 'Prices') returning id", [acmeWs]);
      return rows[0]!.id;
    });
    const err = await expectDbError(
      asUser(pool, alice, (q) =>
        q("insert into public.asset_relationships (workspace_id, source_asset_id, target_asset_id, relationship_type) values ($1, $2, $3, 'links_to')", [
          acmeWs,
          acmeAsset,
          globexAsset,
        ]),
      ),
    );
    expect(err.code).toBe("23503");
  });

  it("gives anonymous users no access at all", async () => {
    const err = await expectDbError(asUser(pool, null, (q) => q("select * from public.assets")));
    expect(err.code).toBe("42501");
  });
});

describe("workspace roles", () => {
  it("lets viewers read but not write", async () => {
    await asUser(pool, vic, async (q) => {
      expect((await q("select id from public.workspaces")).rowCount).toBe(1);
    });
    const err = await expectDbError(asUser(pool, vic, (q) => q("insert into public.assets (workspace_id, type, name) values ($1, 'manual', 'Nope')", [acmeWs])));
    expect(err.code).toBe("42501");
  });

  it("lets editors write assets but not manage members or workspace settings", async () => {
    await asUser(pool, erin, (q) => q("insert into public.assets (workspace_id, type, name) values ($1, 'csv', 'Menu prices')", [acmeWs]));
    await asUser(pool, erin, async (q) => {
      expect((await q("update public.workspaces set name = 'Renamed' where id = $1", [acmeWs])).rowCount).toBe(0);
      expect((await q("update public.workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2", [acmeWs, erin])).rowCount).toBe(0);
    });
  });

  it("does not let anyone insert memberships directly", async () => {
    const outsider = await createAuthUser(pool, "mallory@evil.test");
    const err = await expectDbError(
      asUser(pool, alice, (q) => q("insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'viewer')", [acmeWs, outsider])),
    );
    expect(err.code).toBe("42501");
    const selfJoin = await expectDbError(
      asUser(pool, outsider, (q) => q("insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')", [acmeWs, outsider])),
    );
    expect(selfJoin.code).toBe("42501");
  });

  it("lets admins change roles but not grant ownership", async () => {
    await asUser(pool, adam, async (q) => {
      expect((await q("update public.workspace_members set role = 'editor' where workspace_id = $1 and user_id = $2", [acmeWs, vic])).rowCount).toBe(1);
    });
    const err = await expectDbError(
      asUser(pool, adam, (q) => q("update public.workspace_members set role = 'owner' where workspace_id = $1 and user_id = $2", [acmeWs, adam])),
    );
    expect(err.code).toBe("42501");
    await pool.query("update public.workspace_members set role = 'viewer' where workspace_id = $1 and user_id = $2", [acmeWs, vic]);
  });

  it("never leaves a workspace without an owner", async () => {
    const err = await expectDbError(
      asUser(pool, alice, (q) => q("update public.workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2", [acmeWs, alice])),
    );
    expect(err.message).toMatch(/at least one owner/);
  });
});

describe("approvals and proposals", () => {
  let changeId: string;
  let proposalId: string;
  let assetId: string;

  beforeAll(async () => {
    await asUser(pool, erin, async (q) => {
      assetId = (await q<{ id: string }>("insert into public.assets (workspace_id, type, name) values ($1, 'pdf', 'Menu PDF') returning id", [acmeWs])).rows[0]!.id;
      changeId = (
        await q<{ id: string }>(
          "insert into public.changes (workspace_id, title, change_type, entity_name, attribute_name, old_value, new_value) values ($1, 'Burger price', 'updated', 'Classic Burger', 'price', '12', '15') returning id",
          [acmeWs],
        )
      ).rows[0]!.id;
      proposalId = (
        await q<{ id: string }>(
          "insert into public.update_proposals (workspace_id, change_id, target_asset_id, current_value, proposed_value, impact_level) values ($1, $2, $3, '12', '15', 'high') returning id",
          [acmeWs, changeId, assetId],
        )
      ).rows[0]!.id;
    });
  });

  it("prevents editors from approving proposals", async () => {
    const err = await expectDbError(asUser(pool, erin, (q) => q("update public.update_proposals set approval_status = 'approved' where id = $1", [proposalId])));
    expect(err.code).toBe("42501");
    const err2 = await expectDbError(
      asUser(pool, erin, (q) => q("insert into public.approvals (workspace_id, proposal_id, decision, decided_by) values ($1, $2, 'approved', $3)", [acmeWs, proposalId, erin])),
    );
    expect(err2.code).toBe("42501");
  });

  it("forbids execution before approval", async () => {
    const err = await expectDbError(asUser(pool, alice, (q) => q("update public.update_proposals set execution_status = 'ready' where id = $1", [proposalId])));
    expect(err.code).toBe("23514");
  });

  it("lets admins approve, recording the decision as themselves only", async () => {
    await asUser(pool, adam, async (q) => {
      await q("update public.update_proposals set approval_status = 'approved' where id = $1", [proposalId]);
      await q("insert into public.approvals (workspace_id, proposal_id, decision, decided_by) values ($1, $2, 'approved', $3)", [acmeWs, proposalId, adam]);
    });
    const spoof = await expectDbError(
      asUser(pool, adam, (q) => q("insert into public.approvals (workspace_id, proposal_id, decision, decided_by) values ($1, $2, 'approved', $3)", [acmeWs, proposalId, alice])),
    );
    expect(spoof.code).toBe("42501");
  });

  it("keeps idempotency keys immutable and unique", async () => {
    const err = await expectDbError(asUser(pool, alice, (q) => q("update public.update_proposals set idempotency_key = 'x' where id = $1", [proposalId])));
    expect(err.code).toBe("42501");
  });
});

describe("audit log", () => {
  it("records changes automatically with the acting user", async () => {
    const { rows } = await pool.query(
      "select action, actor_id from public.audit_logs where workspace_id = $1 and action = 'update_proposals.update' order by id desc limit 1",
      [acmeWs],
    );
    expect(rows[0]).toEqual({ action: "update_proposals.update", actor_id: adam });
  });

  it("is readable by admins but not by viewers or other tenants", async () => {
    const adminCount = await asUser(pool, adam, (q) => q("select id from public.audit_logs"));
    expect(adminCount.rowCount).toBeGreaterThan(0);
    expect((await asUser(pool, vic, (q) => q("select id from public.audit_logs"))).rowCount).toBe(0);
    const bobRows = await asUser(pool, bob, (q) => q("select id from public.audit_logs where workspace_id = $1", [acmeWs]));
    expect(bobRows.rowCount).toBe(0);
  });

  it("cannot be written, edited or deleted by clients", async () => {
    const ins = await expectDbError(asUser(pool, alice, (q) => q("insert into public.audit_logs (action, target_type) values ('fake.event', 'x')")));
    expect(ins.code).toBe("42501");
    const upd = await expectDbError(asUser(pool, alice, (q) => q("update public.audit_logs set action = 'tampered'")));
    expect(upd.code).toBe("42501");
  });

  it("is append-only even for privileged roles", async () => {
    const err = await expectDbError(pool.query("update public.audit_logs set action = 'tampered'"));
    expect(err.message).toMatch(/append-only/);
  });
});

describe("subscriptions", () => {
  it("are readable by organization members but never writable by clients", async () => {
    await pool.query("insert into public.subscriptions (organization_id, plan, status) values ($1, 'starter', 'trialing')", [acmeOrg]);
    expect((await asUser(pool, alice, (q) => q("select plan from public.subscriptions"))).rows).toEqual([{ plan: "starter" }]);
    expect((await asUser(pool, bob, (q) => q("select plan from public.subscriptions"))).rowCount).toBe(0);
    const err = await expectDbError(asUser(pool, alice, (q) => q("update public.subscriptions set plan = 'enterprise'")));
    expect(err.code).toBe("42501");
  });
});

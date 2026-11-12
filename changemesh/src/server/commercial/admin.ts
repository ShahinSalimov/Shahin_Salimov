import "server-only";
import { notFound } from "next/navigation";
import { logger } from "@/lib/logger";
import { requireUser } from "../auth/session";
import { getServerEnv } from "../env.server";
import { createServiceClient } from "../supabase/clients";

/**
 * Platform operators are listed in CHANGEMESH_PLATFORM_ADMIN_EMAILS.
 * Everyone else gets a 404 so the page's existence is not revealed.
 */
export async function requirePlatformAdmin() {
  const user = await requireUser("/admin");
  const admins = getServerEnv().CHANGEMESH_PLATFORM_ADMIN_EMAILS;
  if (!user.email || !admins.includes(user.email.toLowerCase())) notFound();
  logger.info("admin.access", { userId: user.id });
  return user;
}

export interface AdminOrganization {
  id: string;
  name: string;
  createdAt: string;
  isDemo: boolean;
  plan: string | null;
  status: string | null;
  workspaces: number;
  members: number;
  assets: number;
}

export interface AdminOverview {
  organizations: AdminOrganization[];
  totals: { organizations: number; users: number; assets: number; activeSubscriptions: number };
  recentEvents: { id: string; type: string; receivedAt: string }[];
}

/** Read-only, aggregate view across tenants (service role). No tenant content is shown. */
export async function adminOverview(): Promise<AdminOverview> {
  const db = createServiceClient();
  const [orgs, subs, ws, members, assets, users, events] = await Promise.all([
    db.from("organizations").select("id, name, created_at, is_demo").order("created_at", { ascending: false }).limit(200),
    db.from("subscriptions").select("organization_id, plan, status"),
    db.from("workspaces").select("id, organization_id"),
    db.from("organization_members").select("organization_id, user_id"),
    db.from("assets").select("workspace_id").eq("status", "active"),
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("stripe_events").select("id, type, received_at").order("received_at", { ascending: false }).limit(20),
  ]);
  for (const r of [orgs, subs, ws, members, assets, users, events]) if (r.error) throw new Error(`admin overview query failed: ${r.error.message}`);
  const wsOrg = new Map((ws.data ?? []).map((w) => [w.id as string, w.organization_id as string]));
  const count = <T,>(rows: T[] | null, key: (r: T) => string | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      const k = key(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const wsCount = count(ws.data, (w) => w.organization_id as string);
  const memberCount = count(members.data, (m) => m.organization_id as string);
  const assetCount = count(assets.data, (a) => wsOrg.get(a.workspace_id as string));
  const subByOrg = new Map((subs.data ?? []).map((s) => [s.organization_id as string, s as { plan: string; status: string }]));
  return {
    organizations: (orgs.data ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      createdAt: o.created_at,
      isDemo: o.is_demo,
      plan: subByOrg.get(o.id)?.plan ?? null,
      status: subByOrg.get(o.id)?.status ?? null,
      workspaces: wsCount.get(o.id) ?? 0,
      members: memberCount.get(o.id) ?? 0,
      assets: assetCount.get(o.id) ?? 0,
    })),
    totals: {
      organizations: orgs.data?.length ?? 0,
      users: users.count ?? 0,
      assets: assets.data?.length ?? 0,
      activeSubscriptions: (subs.data ?? []).filter((s) => ["active", "trialing", "past_due"].includes(s.status as string)).length,
    },
    recentEvents: (events.data ?? []).map((e) => ({ id: e.id, type: e.type, receivedAt: e.received_at })),
  };
}

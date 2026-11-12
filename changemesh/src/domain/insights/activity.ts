import type { AuditEvent, WorkspaceSnapshot } from "../workspace/model";

export type ActivityCategory = "assets" | "relationships" | "changes" | "approvals" | "team" | "workspace" | "other";

export interface ActivityItem {
  id: string;
  actor: string;
  isSystem: boolean;
  verb: string;
  target: string | null;
  targetHref: string | null;
  category: ActivityCategory;
  createdAt: string;
}

const CATEGORY: Record<string, ActivityCategory> = {
  assets: "assets",
  asset_versions: "assets",
  asset_relationships: "relationships",
  changes: "changes",
  change_impacts: "changes",
  update_proposals: "approvals",
  approvals: "approvals",
  workspace_members: "team",
  organization_members: "team",
  workspaces: "workspace",
  extracted_facts: "assets",
  update_executions: "approvals",
  organizations: "workspace",
  integrations: "workspace",
};

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/** Turns a raw audit event into a readable sentence fragment. Unknown events fall back to the raw action. */
export function describeEvent(event: AuditEvent, snapshot: Pick<WorkspaceSnapshot, "assets" | "changes" | "proposals" | "members">, base: string): ActivityItem {
  const [table = "", op = ""] = event.action.split(".");
  const m = event.metadata;
  const changed = Array.isArray(m.changed) ? (m.changed as string[]) : [];
  const status = str(m.status);
  const name = str(m.name);
  const assetName = (id: string | null) => snapshot.assets.find((a) => a.id === id)?.name ?? null;
  const changeTitle = (id: string | null) => snapshot.changes.find((c) => c.id === id)?.title ?? null;
  const memberName = (id: string | null) => {
    const member = snapshot.members.find((x) => x.userId === id);
    return member ? (member.fullName ?? member.email) : null;
  };

  let verb = event.action.replace(/[._]/g, " ");
  let target: string | null = name;
  let targetHref: string | null = null;

  switch (table) {
    case "assets": {
      target = assetName(event.targetId) ?? name ?? "an asset";
      targetHref = snapshot.assets.some((a) => a.id === event.targetId) ? `${base}/assets/${event.targetId}` : null;
      if (op === "insert") verb = "registered";
      else if (op === "delete") verb = "deleted";
      else if (changed.includes("scan_status") && status === "running") verb = "started a scan of";
      else if (changed.includes("scan_status") && status === "failed") verb = "scan failed for";
      else if (changed.includes("scan_status") && status === "partial") verb = "scan partially completed for";
      else if (changed.includes("scan_status")) verb = "scanned";
      else if (changed.includes("current_version")) verb = "published a new version of";
      else verb = "updated";
      break;
    }
    case "asset_relationships":
      target = "a relationship";
      targetHref = `${base}/graph`;
      verb = op === "insert" ? "suggested" : status === "confirmed" ? "confirmed" : status === "rejected" ? "rejected" : "updated";
      break;
    case "changes": {
      target = changeTitle(event.targetId) ?? name ?? "a change";
      targetHref = snapshot.changes.some((c) => c.id === event.targetId) ? `${base}/changes/${event.targetId}` : null;
      verb = op === "insert" ? "recorded change" : status ? `marked ${status.replace(/_/g, " ")}` : "updated change";
      break;
    }
    case "update_proposals": {
      const p = snapshot.proposals.find((x) => x.id === event.targetId);
      target = p ? `update for ${assetName(p.targetAssetId) ?? "an asset"}` : "an update proposal";
      targetHref = p ? `${base}/proposals?focus=${p.id}` : null;
      const exec = str(m.execution_status);
      if (changed.includes("execution_status") && exec) verb = exec === "completed" ? "completed" : `set execution to ${exec.replace(/_/g, " ")} for`;
      else if (status === "approved") verb = "approved";
      else if (status === "rejected") verb = "rejected";
      else if (status === "needs_revision") verb = "requested a revision of";
      else verb = op === "insert" ? "proposed" : "updated";
      break;
    }
    case "approvals":
      verb = `recorded decision “${(str(m.decision) ?? "").replace(/_/g, " ")}”`;
      target = null;
      break;
    case "workspace_members": {
      const who = memberName(str(m.user_id) ?? event.targetId) ?? "a member";
      const role = ROLE_LABEL[str(m.role) ?? ""] ?? str(m.role);
      verb = op === "insert" ? "added" : op === "delete" ? "removed" : "changed the role of";
      target = op === "update" && role ? `${who} → ${role}` : who;
      targetHref = `${base}/settings/team`;
      break;
    }
    case "update_executions":
      verb = op === "insert" ? "started an update" : status === "succeeded" ? "finished an update" : status === "failed" ? "had an update fail" : "updated an execution";
      target = null;
      targetHref = `${base}/updates`;
      break;
    case "extracted_facts":
      verb = op === "delete" ? "removed a manually entered fact" : "added a fact manually";
      target = null;
      break;
    case "workspaces":
      verb = changed.includes("name") ? "renamed the workspace to" : op === "insert" ? "created the workspace" : "updated workspace settings";
      target = changed.includes("name") ? name : null;
      break;
  }

  return {
    id: event.id,
    actor: event.actorName ?? (event.actorType === "user" ? "A former member" : "CHANGEMESH"),
    isSystem: event.actorType !== "user",
    verb,
    target,
    targetHref,
    category: CATEGORY[table] ?? "other",
    createdAt: event.createdAt,
  };
}

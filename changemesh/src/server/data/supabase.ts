import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { WorkspaceRole } from "@/domain/rbac/roles";
import type { CreateAssetInput, CreateChangeInput, DecisionInput } from "@/domain/workspace/inputs";
import type { WorkspaceSnapshot } from "@/domain/workspace/model";
import { AppError, fromPostgresError, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createUserClient } from "../supabase/clients";
import { approvalRow, assetRow, auditRow, changeRow, impactRow, integrationRow, memberRow, proposalRow, relationshipRow, subscriptionRow, versionRow } from "./rows";
import type { WorkspaceData } from "./source";

const AUDIT_LIMIT = 300;
function check<T>(op: string, result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) {
    const mapped = fromPostgresError(result.error);
    if (mapped) throw mapped;
    logger.error("db.query_failed", { op, code: result.error.code, message: result.error.message });
    throw new AppError("INTERNAL", "Could not load workspace data. Please try again.");
  }
  return result.data as T;
}

function parseRows<S extends z.ZodTypeAny>(op: string, schema: S, rows: unknown[] | null): z.output<S>[] {
  return (rows ?? []).flatMap((row) => {
    const parsed = schema.safeParse(row);
    if (parsed.success) return [parsed.data];
    // Skip malformed rows instead of failing the whole page, but make it visible in logs.
    logger.error("db.row_invalid", { op, issues: parsed.error.issues.slice(0, 3) });
    return [];
  });
}

/** Real tenant data. Every query runs as the signed-in user, so RLS applies. */
export class SupabaseWorkspaceData implements WorkspaceData {
  constructor(
    private readonly workspaceId: string,
    private readonly organizationId: string,
    private readonly client?: SupabaseClient,
  ) {}

  private async db() {
    return this.client ?? createUserClient();
  }

  async snapshot(): Promise<WorkspaceSnapshot> {
    const db = await this.db();
    const ws = this.workspaceId;
    const [assets, versions, rels, changes, impacts, proposals, approvals, integrations, audit, members, subscription] = await Promise.all([
      db.from("assets").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }),
      db.from("asset_versions").select("id, asset_id, version, content_hash, summary, created_at").eq("workspace_id", ws).order("version", { ascending: false }),
      db.from("asset_relationships").select("*").eq("workspace_id", ws),
      db.from("changes").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }),
      db.from("change_impacts").select("*").eq("workspace_id", ws),
      db.from("update_proposals").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }),
      db.from("approvals").select("*, profiles!approvals_decided_by_fkey(full_name)").eq("workspace_id", ws).order("created_at", { ascending: false }),
      db.from("integrations").select("id, provider, display_name, status, last_synced_at, last_error").eq("workspace_id", ws),
      db.from("audit_logs").select("*, profiles!audit_logs_actor_id_fkey(full_name)").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(AUDIT_LIMIT),
      db.from("workspace_members").select("user_id, role, created_at, profiles!workspace_members_user_id_fkey(full_name, email)").eq("workspace_id", ws).order("created_at"),
      db.from("subscriptions").select("plan, status, current_period_end, cancel_at_period_end").eq("organization_id", this.organizationId).maybeSingle(),
    ]);

    const role = parseRows("members", memberRow, check("members", members));
    const me = (await db.auth.getUser()).data.user?.id;
    const myRole = role.find((m) => m.user_id === me)?.role;

    return {
      assets: parseRows("assets", assetRow, check("assets", assets)).map((r) => ({
        id: r.id, type: r.type, name: r.name, description: r.description, sourceUrl: r.source_url, mimeType: r.mime_type, sizeBytes: r.size_bytes,
        status: r.status, scanStatus: r.scan_status, lastScannedAt: r.last_scanned_at, lastScanError: r.last_scan_error, currentVersion: r.current_version,
        isCustomerFacing: r.is_customer_facing, origin: r.origin, createdAt: r.created_at, updatedAt: r.updated_at,
      })),
      versions: parseRows("versions", versionRow, check("versions", versions)).map((r) => ({
        id: r.id, assetId: r.asset_id, version: r.version, contentHash: r.content_hash, summary: r.summary, createdAt: r.created_at,
      })),
      relationships: parseRows("relationships", relationshipRow, check("relationships", rels)).map((r) => ({
        id: r.id, sourceAssetId: r.source_asset_id, targetAssetId: r.target_asset_id, type: r.relationship_type, status: r.status,
        confidence: r.confidence, origin: r.origin, note: r.note, createdAt: r.created_at,
      })),
      changes: parseRows("changes", changeRow, check("changes", changes)).map((r) => ({
        id: r.id, title: r.title, description: r.description, type: r.change_type, status: r.status, sourceAssetId: r.source_asset_id,
        entityName: r.entity_name, attributeName: r.attribute_name, oldValue: r.old_value, newValue: r.new_value, origin: r.origin, createdAt: r.created_at,
      })),
      impacts: parseRows("impacts", impactRow, check("impacts", impacts)).map((r) => ({
        id: r.id, changeId: r.change_id, assetId: r.asset_id, level: r.impact_level, depth: r.depth, path: r.relationship_path, oldValue: r.old_value,
        newValue: r.new_value, confidence: r.confidence, recommendedAction: r.recommended_action, origin: r.origin, createdAt: r.created_at,
      })),
      proposals: parseRows("proposals", proposalRow, check("proposals", proposals)).map((r) => ({
        id: r.id, changeId: r.change_id, changeImpactId: r.change_impact_id, targetAssetId: r.target_asset_id, currentValue: r.current_value,
        proposedValue: r.proposed_value, reason: r.reason, evidence: r.evidence, impactLevel: r.impact_level, approvalStatus: r.approval_status,
        executionStatus: r.execution_status, origin: r.origin, createdAt: r.created_at, updatedAt: r.updated_at,
      })),
      approvals: parseRows("approvals", approvalRow, check("approvals", approvals)).map((r) => ({
        id: r.id, proposalId: r.proposal_id, decision: r.decision, comment: r.comment, decidedBy: r.decided_by, decidedByName: r.profiles?.full_name ?? null, createdAt: r.created_at,
      })),
      integrations: parseRows("integrations", integrationRow, check("integrations", integrations)).map((r) => ({
        id: r.id, provider: r.provider, displayName: r.display_name, status: r.status, lastSyncedAt: r.last_synced_at, lastError: r.last_error,
      })),
      audit: parseRows("audit", auditRow, check("audit", audit)).map((r) => ({
        id: r.id, actorId: r.actor_id, actorName: r.profiles?.full_name ?? null, actorType: r.actor_type, action: r.action, targetType: r.target_type,
        targetId: r.target_id, metadata: r.metadata, createdAt: r.created_at,
      })),
      auditVisible: myRole === "owner" || myRole === "admin",
      members: role.map((r) => ({ userId: r.user_id, fullName: r.profiles.full_name, email: r.profiles.email, role: r.role, joinedAt: r.created_at })),
      subscription: (() => {
        const row = check("subscription", subscription);
        const parsed = row ? subscriptionRow.safeParse(row) : null;
        return parsed?.success
          ? { plan: parsed.data.plan, status: parsed.data.status, currentPeriodEnd: parsed.data.current_period_end, cancelAtPeriodEnd: parsed.data.cancel_at_period_end }
          : null;
      })(),
    };
  }

  async createAsset(input: CreateAssetInput) {
    const db = await this.db();
    const res = await db
      .from("assets")
      .insert({ workspace_id: this.workspaceId, type: input.type, name: input.name, description: input.description, source_url: input.sourceUrl })
      .select("id")
      .single<{ id: string }>();
    return check("createAsset", res);
  }

  async createChange(input: CreateChangeInput) {
    const db = await this.db();
    const res = await db
      .from("changes")
      .insert({
        workspace_id: this.workspaceId,
        title: input.title,
        change_type: input.type,
        description: input.description,
        entity_name: input.entityName,
        attribute_name: input.attributeName,
        old_value: input.oldValue,
        new_value: input.newValue,
        source_asset_id: input.sourceAssetId,
      })
      .select("id")
      .single<{ id: string }>();
    return check("createChange", res);
  }

  async decideProposal(input: DecisionInput) {
    const db = await this.db();
    const res = await db.rpc("decide_update_proposal", { p_proposal_id: input.proposalId, p_decision: input.decision, p_comment: input.comment });
    check("decideProposal", res);
  }

  async reviewRelationship(id: string, status: "confirmed" | "rejected") {
    const db = await this.db();
    const res = await db.from("asset_relationships").update({ status }).eq("id", id).eq("workspace_id", this.workspaceId).select("id");
    if (!check("reviewRelationship", res)?.length) throw notFound("Relationship not found.");
  }

  async updateMemberRole(userId: string, role: WorkspaceRole) {
    const db = await this.db();
    const res = await db.from("workspace_members").update({ role }).eq("workspace_id", this.workspaceId).eq("user_id", userId).select("user_id");
    if (!check("updateMemberRole", res)?.length) throw notFound("Member not found.");
  }

  async removeMember(userId: string) {
    const db = await this.db();
    const res = await db.from("workspace_members").delete().eq("workspace_id", this.workspaceId).eq("user_id", userId).select("user_id");
    if (!check("removeMember", res)?.length) throw notFound("Member not found.");
  }

  async renameWorkspace(name: string) {
    const db = await this.db();
    const res = await db.from("workspaces").update({ name }).eq("id", this.workspaceId).select("id");
    if (!check("renameWorkspace", res)?.length) throw notFound("Workspace not found.");
  }
}

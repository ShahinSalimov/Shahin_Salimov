import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { WorkspaceRole } from "@/domain/rbac/roles";
import type { FactDraft } from "@/domain/extraction/fact";
import type { RelationshipSuggestion } from "@/domain/graph/suggest";
import type { CreateAssetInput, CreateChangeInput, CreateRelationshipInput, DecisionInput, UpdateAssetInput } from "@/domain/workspace/inputs";
import type { AiUsageRecord, AssetIntelligence, ExecutionMode, ExtractedFact, RecordOrigin, UpdateExecution, WorkspaceSnapshot } from "@/domain/workspace/model";
import { ScanError } from "../intelligence/errors";
import type { ScanResult } from "../intelligence/analyze";
import { AppError, conflict, fromPostgresError, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createUserClient } from "../supabase/clients";
import { aiUsageRow, executionRow, approvalRow, assetRow, auditRow, changeAnalysisSchema, changeRow, factCountRow, factRow, impactRow, integrationRow, memberRow, proposalRow, relationshipRow, scanRow, subscriptionRow, versionRow } from "./rows";
import type { AiUsageEntry, RecordedScan, SavedAnalysis, StoredFile, WorkspaceData } from "./source";

const AUDIT_LIMIT = 300;
const FACT_LIMIT = 2000;
const WORKSPACE_FACT_LIMIT = 20_000;
const PAGE = 1000; // PostgREST default max rows per request
const BUCKET = "asset-files";
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
    const [assets, versions, rels, changes, impacts, proposals, approvals, integrations, audit, members, subscription, factCounts] = await Promise.all([
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
      db.from("asset_fact_counts").select("asset_id, facts_count").eq("workspace_id", ws),
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
        analysis: r.analysis ? (changeAnalysisSchema.safeParse(r.analysis).data ?? null) : null, analyzedAt: r.analyzed_at ?? null,
      })),
      impacts: parseRows("impacts", impactRow, check("impacts", impacts)).map((r) => ({
        id: r.id, changeId: r.change_id, assetId: r.asset_id, level: r.impact_level, depth: r.depth, path: r.relationship_path, oldValue: r.old_value,
        newValue: r.new_value, confidence: r.confidence, recommendedAction: r.recommended_action, origin: r.origin, createdAt: r.created_at,
      })),
      proposals: parseRows("proposals", proposalRow, check("proposals", proposals)).map((r) => ({
        id: r.id, changeId: r.change_id, changeImpactId: r.change_impact_id, targetAssetId: r.target_asset_id, currentValue: r.current_value,
        proposedValue: r.proposed_value, reason: r.reason, evidence: r.evidence, impactLevel: r.impact_level, approvalStatus: r.approval_status,
        executionStatus: r.execution_status, origin: r.origin, createdAt: r.created_at, updatedAt: r.updated_at,
        idempotencyKey: r.idempotency_key, executionResult: r.execution_result ?? null, executedAt: r.executed_at ?? null, revisionCount: r.revision_count ?? 0,
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
      factCounts: Object.fromEntries(parseRows("factCounts", factCountRow, check("factCounts", factCounts)).map((r) => [r.asset_id, r.facts_count])),
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

  async createChange(input: CreateChangeInput, opts?: { origin?: RecordOrigin }) {
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
        origin: opts?.origin ?? "manual",
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

  async updateAsset(input: UpdateAssetInput) {
    const db = await this.db();
    const res = await db
      .from("assets")
      .update({ name: input.name, description: input.description, source_url: input.sourceUrl, is_customer_facing: input.isCustomerFacing })
      .eq("id", input.assetId)
      .eq("workspace_id", this.workspaceId)
      .select("id");
    if (!check("updateAsset", res)?.length) throw notFound("Asset not found.");
  }

  async deleteAsset(assetId: string) {
    const db = await this.db();
    const res = await db.from("assets").delete().eq("id", assetId).eq("workspace_id", this.workspaceId).select("id");
    if (!check("deleteAsset", res)?.length) throw notFound("Asset not found.");
    // Remove stored originals. The database rows are already gone; a leftover file is logged, not hidden.
    const prefix = `${this.workspaceId}/${assetId}`;
    const listed = await db.storage.from(BUCKET).list(prefix, { limit: 1000 });
    const paths = (listed.data ?? []).map((o) => `${prefix}/${o.name}`);
    if (paths.length) {
      const removed = await db.storage.from(BUCKET).remove(paths);
      if (removed.error) logger.error("storage.remove_failed", { assetId, count: paths.length, message: removed.error.message });
    }
  }

  async assetIntelligence(assetId: string): Promise<AssetIntelligence> {
    const db = await this.db();
    const asset = check("asset", await db.from("assets").select("current_version").eq("id", assetId).eq("workspace_id", this.workspaceId).maybeSingle<{ current_version: number }>());
    if (!asset) throw notFound("Asset not found.");
    const [facts, scans] = await Promise.all([
      db
        .from("extracted_facts")
        .select("id, asset_id, asset_version, scan_id, entity_name, attribute_name, value_text, value_number, value_unit, normalized_value, source_location, confidence, method, origin, extracted_at")
        .eq("asset_id", assetId)
        .or(`asset_version.is.null,asset_version.eq.${Number(asset.current_version)}`)
        .order("entity_name")
        .limit(FACT_LIMIT),
      db.from("asset_scans").select("*").eq("asset_id", assetId).order("started_at", { ascending: false }).limit(20),
    ]);
    return {
      facts: parseRows("facts", factRow, check("facts", facts)).map((r) => ({
        id: r.id, assetId: r.asset_id, assetVersion: r.asset_version, scanId: r.scan_id, entityName: r.entity_name, attributeName: r.attribute_name,
        valueText: r.value_text, valueNumber: r.value_number, valueUnit: r.value_unit, normalizedValue: r.normalized_value, location: r.source_location,
        confidence: r.confidence, method: r.method, origin: r.origin, extractedAt: r.extracted_at,
      })),
      scans: parseRows("scans", scanRow, check("scans", scans)).map((r) => ({
        id: r.id, assetId: r.asset_id, kind: r.kind, status: r.status, startedAt: r.started_at, finishedAt: r.finished_at, assetVersion: r.asset_version,
        factsCount: r.facts_count, error: r.error, warnings: r.warnings, stats: r.stats,
      })),
    };
  }

  async startScan(assetId: string, kind: "website" | "upload") {
    const db = await this.db();
    const res = await db.rpc("start_asset_scan", { p_asset_id: assetId, p_kind: kind });
    return check("startScan", res) as string;
  }

  async storeOriginal(assetId: string, file: { bytes: Uint8Array; contentType: string; hash: string; extension: string }) {
    const db = await this.db();
    const path = `${this.workspaceId}/${assetId}/${file.hash}.${file.extension}`;
    const { error } = await db.storage.from(BUCKET).upload(path, file.bytes, { contentType: file.contentType, upsert: true });
    if (error) {
      logger.error("storage.upload_failed", { assetId, message: error.message });
      throw new ScanError("The file could not be stored. Nothing was analyzed; please try again.");
    }
    return path;
  }

  async recordScan(scanId: string, result: ScanResult, file?: StoredFile): Promise<RecordedScan> {
    const db = await this.db();
    const res = await db
      .rpc("record_scan_result", {
        p_scan_id: scanId,
        p_status: result.status,
        p_content_hash: result.contentHash,
        p_summary: { ...result.summary, ...(file ? { fileName: file.fileName, storagePath: file.storagePath } : {}) },
        p_facts: result.facts.map((f) => ({
          entity_name: f.entityName, attribute_name: f.attributeName, value_text: f.valueText, value_number: f.valueNumber, value_unit: f.valueUnit,
          normalized_value: f.normalizedValue, source_location: f.location, confidence: f.confidence, method: f.method,
        })),
        p_warnings: result.warnings,
        p_error: result.error,
        p_stats: result.stats,
      })
      .single<{ asset_version: number | null; new_version: boolean; facts_count: number }>();
    const row = check("recordScan", res);
    if (file && result.status !== "failed") {
      const scan = check("scanAsset", await db.from("asset_scans").select("asset_id").eq("id", scanId).single<{ asset_id: string }>());
      const upd = await db.from("assets").update({ storage_path: file.storagePath, mime_type: file.mimeType, size_bytes: file.sizeBytes }).eq("id", scan.asset_id);
      if (upd.error) logger.warn("asset.file_meta_update_failed", { scanId, message: upd.error.message });
    }
    return { assetVersion: row.asset_version, newVersion: row.new_version, factsCount: row.facts_count };
  }

  async addManualFact(assetId: string, fact: FactDraft) {
    const db = await this.db();
    const res = await db
      .from("extracted_facts")
      .insert({
        workspace_id: this.workspaceId, asset_id: assetId, asset_version: null, entity_name: fact.entityName, attribute_name: fact.attributeName,
        value_text: fact.valueText, value_number: fact.valueNumber, value_unit: fact.valueUnit, normalized_value: fact.normalizedValue,
        source_location: fact.location, confidence: fact.confidence, method: "manual", origin: "manual",
      })
      .select("id")
      .single<{ id: string }>();
    return check("addManualFact", res);
  }

  async deleteFact(factId: string) {
    const db = await this.db();
    const res = await db.from("extracted_facts").delete().eq("id", factId).eq("workspace_id", this.workspaceId).eq("method", "manual").select("id");
    if (!check("deleteFact", res)?.length) throw notFound("Fact not found, or it is a scanned fact (scanned facts change only when the asset is scanned again).");
  }

  async workspaceFacts(): Promise<ExtractedFact[]> {
    const db = await this.db();
    const out: ExtractedFact[] = [];
    for (let from = 0; from < WORKSPACE_FACT_LIMIT; from += PAGE) {
      const res = await db
        .from("current_facts")
        .select("id, asset_id, asset_version, scan_id, entity_name, attribute_name, value_text, value_number, value_unit, normalized_value, source_location, confidence, method, origin, extracted_at")
        .eq("workspace_id", this.workspaceId)
        .order("id")
        .range(from, from + PAGE - 1);
      const rows = parseRows("workspaceFacts", factRow, check("workspaceFacts", res));
      out.push(
        ...rows.map((r) => ({
          id: r.id, assetId: r.asset_id, assetVersion: r.asset_version, scanId: r.scan_id, entityName: r.entity_name, attributeName: r.attribute_name,
          valueText: r.value_text, valueNumber: r.value_number, valueUnit: r.value_unit, normalizedValue: r.normalized_value, location: r.source_location,
          confidence: r.confidence, method: r.method, origin: r.origin, extractedAt: r.extracted_at,
        })),
      );
      if (rows.length < PAGE) break;
    }
    if (out.length >= WORKSPACE_FACT_LIMIT) logger.warn("graph.facts_truncated", { workspaceId: this.workspaceId, limit: WORKSPACE_FACT_LIMIT });
    return out;
  }

  async createRelationship(input: CreateRelationshipInput) {
    const db = await this.db();
    const res = await db
      .from("asset_relationships")
      .insert({ workspace_id: this.workspaceId, source_asset_id: input.sourceAssetId, target_asset_id: input.targetAssetId, relationship_type: input.type, status: "confirmed", origin: "manual", confidence: 1, note: input.note })
      .select("id")
      .single<{ id: string }>();
    if (res.error?.code === "23505") throw conflict("These assets already have a relationship of this type.");
    if (res.error?.code === "23503") throw notFound("One of the assets does not exist in this workspace.");
    return check("createRelationship", res);
  }

  async deleteRelationship(id: string) {
    const db = await this.db();
    const res = await db.from("asset_relationships").delete().eq("id", id).eq("workspace_id", this.workspaceId).select("id");
    if (!check("deleteRelationship", res)?.length) throw notFound("Relationship not found.");
  }

  async addSuggestions(suggestions: RelationshipSuggestion[]) {
    const db = await this.db();
    let created = 0;
    // One by one so a pair created concurrently (unique violation) does not cancel the others.
    for (const s of suggestions) {
      const res = await db.from("asset_relationships").insert({
        workspace_id: this.workspaceId, source_asset_id: s.sourceAssetId, target_asset_id: s.targetAssetId, relationship_type: s.type,
        status: "suggested", origin: "rule", confidence: s.confidence, note: s.note,
      });
      if (!res.error) created++;
      else if (res.error.code !== "23505") check("addSuggestions", { data: null, error: res.error });
    }
    return created;
  }

  async versionFacts(assetId: string, version: number): Promise<ExtractedFact[]> {
    const db = await this.db();
    const res = await db
      .from("extracted_facts")
      .select("id, asset_id, asset_version, scan_id, entity_name, attribute_name, value_text, value_number, value_unit, normalized_value, source_location, confidence, method, origin, extracted_at")
      .eq("asset_id", assetId)
      .eq("asset_version", version)
      .limit(5000);
    return parseRows("versionFacts", factRow, check("versionFacts", res)).map((r) => ({
      id: r.id, assetId: r.asset_id, assetVersion: r.asset_version, scanId: r.scan_id, entityName: r.entity_name, attributeName: r.attribute_name,
      valueText: r.value_text, valueNumber: r.value_number, valueUnit: r.value_unit, normalizedValue: r.normalized_value, location: r.source_location,
      confidence: r.confidence, method: r.method, origin: r.origin, extractedAt: r.extracted_at,
    }));
  }

  async saveChangeAnalysis(changeId: string, payload: SavedAnalysis) {
    const db = await this.db();
    const res = await db
      .rpc("save_change_analysis", {
        p_change_id: changeId,
        p_impacts: payload.impacts.map((i) => ({
          asset_id: i.assetId, impact_level: i.level, depth: i.depth, relationship_path: i.path, old_value: i.oldValue, new_value: i.newValue,
          confidence: i.confidence, recommended_action: i.recommendedAction, origin: i.origin,
        })),
        p_proposals: payload.proposals.map((p) => ({
          target_asset_id: p.targetAssetId, current_value: p.currentValue, proposed_value: p.proposedValue, reason: p.reason, evidence: p.evidence, impact_level: p.impactLevel, origin: p.origin,
        })),
        p_analysis: payload.analysis,
      })
      .single<{ impacts_saved: number; proposals_created: number; proposals_kept: number; new_status: string }>();
    const row = check("saveChangeAnalysis", res);
    return { impactsSaved: row.impacts_saved, proposalsCreated: row.proposals_created, proposalsKept: row.proposals_kept, status: row.new_status };
  }

  async recordAiUsage(entry: AiUsageEntry) {
    const db = await this.db();
    const res = await db.from("ai_usage").insert({
      workspace_id: this.workspaceId, change_id: entry.changeId, operation: "impact_analysis", provider: "claude", model: entry.model, status: entry.status,
      input_tokens: entry.inputTokens, output_tokens: entry.outputTokens, cost_usd: entry.costUsd, attempts: entry.attempts, duration_ms: entry.durationMs, error: entry.error?.slice(0, 1000) ?? null,
    });
    // Usage tracking must never hide the analysis result, but a failure is logged.
    if (res.error) logger.error("ai.usage_record_failed", { message: res.error.message });
  }

  async aiUsage(): Promise<AiUsageRecord[]> {
    const db = await this.db();
    const res = await db.from("ai_usage").select("id, change_id, model, status, input_tokens, output_tokens, cost_usd, created_at").eq("workspace_id", this.workspaceId).order("created_at", { ascending: false }).limit(200);
    return parseRows("aiUsage", aiUsageRow, check("aiUsage", res)).map((r) => ({
      id: r.id, changeId: r.change_id, model: r.model, status: r.status, inputTokens: r.input_tokens, outputTokens: r.output_tokens, costUsd: r.cost_usd, createdAt: r.created_at,
    }));
  }

  async reviseProposal(proposalId: string, input: { proposedValue: string | null; reason: string | null; note: string }) {
    const db = await this.db();
    check("reviseProposal", await db.rpc("revise_update_proposal", { p_proposal_id: proposalId, p_proposed_value: input.proposedValue, p_reason: input.reason, p_note: input.note }));
  }

  async startExecution(proposalId: string, action: "execute" | "rollback", mode: ExecutionMode) {
    const db = await this.db();
    const row = check("startExecution", await db.rpc("start_proposal_execution", { p_proposal_id: proposalId, p_action: action, p_mode: mode }).single<{ execution_id: string; idempotency_key: string; attempt: number }>());
    return { executionId: row.execution_id, idempotencyKey: row.idempotency_key, attempt: row.attempt };
  }

  async finishExecution(executionId: string, succeeded: boolean, result: Record<string, unknown>, error: string | null) {
    const db = await this.db();
    return check("finishExecution", await db.rpc("finish_proposal_execution", { p_execution_id: executionId, p_succeeded: succeeded, p_result: result, p_error: error })) as string;
  }

  async recordSimulation(proposalId: string, result: Record<string, unknown>) {
    const db = await this.db();
    const p = check("simProposal", await db.from("update_proposals").select("idempotency_key").eq("id", proposalId).eq("workspace_id", this.workspaceId).maybeSingle<{ idempotency_key: string }>());
    if (!p) throw notFound("Proposal not found.");
    check("recordSimulation", await db.from("update_executions").insert({ workspace_id: this.workspaceId, proposal_id: proposalId, action: "simulate", mode: "simulation", status: "succeeded", idempotency_key: p.idempotency_key, result, finished_at: new Date().toISOString() }));
  }

  async executions(): Promise<UpdateExecution[]> {
    const db = await this.db();
    const res = await db.from("update_executions").select("*, profiles!update_executions_created_by_fkey(full_name)").eq("workspace_id", this.workspaceId).order("started_at", { ascending: false }).limit(300);
    return parseRows("executions", executionRow, check("executions", res)).map((r) => ({
      id: r.id, proposalId: r.proposal_id, action: r.action, mode: r.mode, status: r.status, idempotencyKey: r.idempotency_key, attempt: r.attempt,
      result: r.result, error: r.error, actorName: r.profiles?.full_name ?? null, startedAt: r.started_at, finishedAt: r.finished_at,
    }));
  }
}

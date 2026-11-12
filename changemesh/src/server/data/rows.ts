import { z } from "zod";
import { WORKSPACE_ROLES } from "@/domain/rbac/roles";
import {
  APPROVAL_STATUSES,
  ASSET_TYPES,
  CHANGE_STATUSES,
  CHANGE_TYPES,
  EXECUTION_STATUSES,
  IMPACT_LEVELS,
  INTEGRATION_STATUSES,
  RECORD_ORIGINS,
  RELATIONSHIP_STATUSES,
  RELATIONSHIP_TYPES,
  SCAN_STATUSES,
  SUBSCRIPTION_PLANS,
} from "@/domain/workspace/model";

/** Zod schemas for database rows as returned by PostgREST (snake_case). Verified against PostgreSQL in tests/db/row-mapping.test.ts. */
const num = z.coerce.number();
const nullableText = z.string().nullable();
const json = z.record(z.string(), z.unknown());

export const assetRow = z.object({
  id: z.string(), type: z.enum(ASSET_TYPES), name: z.string(), description: nullableText, source_url: nullableText, mime_type: nullableText,
  size_bytes: num.nullable(), status: z.enum(["active", "archived"]), scan_status: z.enum(SCAN_STATUSES), last_scanned_at: nullableText,
  last_scan_error: nullableText, current_version: num, is_customer_facing: z.boolean(), origin: z.enum(RECORD_ORIGINS), created_at: z.string(), updated_at: z.string(),
});
export const versionRow = z.object({ id: z.string(), asset_id: z.string(), version: num, content_hash: nullableText, summary: json, created_at: z.string() });
export const relationshipRow = z.object({
  id: z.string(), source_asset_id: z.string(), target_asset_id: z.string(), relationship_type: z.enum(RELATIONSHIP_TYPES),
  status: z.enum(RELATIONSHIP_STATUSES), confidence: num, origin: z.enum(RECORD_ORIGINS), note: nullableText, created_at: z.string(),
});
export const changeRow = z.object({
  id: z.string(), title: z.string(), description: nullableText, change_type: z.enum(CHANGE_TYPES), status: z.enum(CHANGE_STATUSES),
  source_asset_id: nullableText, entity_name: nullableText, attribute_name: nullableText, old_value: nullableText, new_value: nullableText,
  origin: z.enum(RECORD_ORIGINS), created_at: z.string(), analysis: json.nullable().optional(), analyzed_at: nullableText.optional(),
});
const pathStep = z.object({ assetId: z.string(), relationship: z.union([z.enum(RELATIONSHIP_TYPES), z.literal("contains"), z.literal("shares")]) });
export const impactRow = z.object({
  id: z.string(), change_id: z.string(), asset_id: z.string(), impact_level: z.enum(IMPACT_LEVELS), depth: num, relationship_path: z.array(pathStep).catch([]),
  old_value: nullableText, new_value: nullableText, confidence: num, recommended_action: nullableText, origin: z.enum(RECORD_ORIGINS), created_at: z.string(),
});
export const proposalRow = z.object({
  id: z.string(), change_id: z.string(), change_impact_id: nullableText, target_asset_id: z.string(), current_value: nullableText, proposed_value: nullableText,
  reason: nullableText, evidence: z.array(z.object({ label: z.string(), detail: z.string().optional() })).catch([]), impact_level: z.enum(IMPACT_LEVELS),
  approval_status: z.enum(APPROVAL_STATUSES), execution_status: z.enum(EXECUTION_STATUSES), origin: z.enum(RECORD_ORIGINS), created_at: z.string(), updated_at: z.string(),
  idempotency_key: z.string().optional(), execution_result: json.nullable().optional(), executed_at: nullableText.optional(), revision_count: num.optional(),
});
const profileRef = z.object({ full_name: nullableText, email: z.string().optional() }).nullable();
export const approvalRow = z.object({
  id: z.string(), proposal_id: z.string(), decision: z.enum(["approved", "rejected", "needs_revision"]), comment: nullableText, decided_by: z.string(), created_at: z.string(), profiles: profileRef,
});
export const integrationRow = z.object({ id: z.string(), provider: z.string(), display_name: z.string(), status: z.enum(INTEGRATION_STATUSES), last_synced_at: nullableText, last_error: nullableText });
export const auditRow = z.object({
  id: z.union([z.string(), z.number()]).transform(String), actor_id: nullableText, actor_type: z.enum(["user", "system", "service"]), action: z.string(),
  target_type: z.string(), target_id: nullableText, metadata: json, created_at: z.string(), profiles: profileRef,
});
export const memberRow = z.object({ user_id: z.string(), role: z.enum(WORKSPACE_ROLES), created_at: z.string(), profiles: z.object({ full_name: nullableText, email: z.string() }) });
export const subscriptionRow = z.object({ plan: z.enum(SUBSCRIPTION_PLANS), status: z.string(), current_period_end: nullableText, cancel_at_period_end: z.boolean() });


const locationSchema = z
  .object({
    kind: z.enum(["row", "page", "element", "json_ld", "line", "meta", "link", "manual"]),
    row: z.number().optional(),
    column: z.string().optional(),
    page: z.number().optional(),
    line: z.number().optional(),
    path: z.string().optional(),
    snippet: z.string().optional(),
  })
  .catch({ kind: "manual" });

export const factRow = z.object({
  id: z.string(), asset_id: z.string(), asset_version: num.nullable(), scan_id: nullableText, entity_name: z.string(), attribute_name: z.string(),
  value_text: z.string(), value_number: num.nullable(), value_unit: nullableText, normalized_value: z.string(), source_location: locationSchema,
  confidence: num, method: z.enum(["csv", "html", "json_ld", "pdf_text", "plain_text", "manual"]), origin: z.enum(RECORD_ORIGINS), extracted_at: z.string(),
});
export const scanRow = z.object({
  id: z.string(), asset_id: z.string(), kind: z.enum(["website", "upload"]), status: z.enum(SCAN_STATUSES), started_at: z.string(), finished_at: nullableText,
  asset_version: num.nullable(), facts_count: num, error: nullableText, warnings: z.array(z.string()).catch([]), stats: json,
});
export const factCountRow = z.object({ asset_id: z.string(), facts_count: num });

export const aiUsageRow = z.object({
  id: z.string(), change_id: nullableText, model: z.string(), status: z.enum(["succeeded", "failed", "rejected_output"]), input_tokens: num, output_tokens: num,
  cost_usd: num.nullable(), created_at: z.string(),
});

const levelCounts = { critical: num, high: num, medium: num, low: num };
export const changeAnalysisSchema = z.object({
  generatedBy: z.enum(["rules", "ai", "demo"]),
  model: z.string().nullable().optional(),
  summary: z.string(),
  warnings: z.array(z.string()).catch([]),
  counts: z.object({ ...levelCounts, direct: num, indirect: num, alreadyUpdated: num, inconsistencies: num }),
  relatedFacts: z.array(z.string()).optional(),
  usage: z.object({ inputTokens: num, outputTokens: num, costUsd: num.nullable() }).nullable().optional(),
  notes: z.record(z.string(), z.object({ reasons: z.array(z.string()), rationale: z.string().nullable(), currentValue: z.string().nullable(), containsFact: z.boolean(), inconsistent: z.boolean() })).optional(),
  skipped: z.array(z.object({ assetId: z.string(), reason: z.string() })).optional(),
});

export const executionRow = z.object({
  id: z.string(), proposal_id: z.string(), action: z.enum(["execute", "rollback", "simulate"]), mode: z.enum(["internal", "manual", "integration", "simulation"]),
  status: z.enum(["running", "succeeded", "failed"]), idempotency_key: z.string(), attempt: num, result: json, error: nullableText, started_at: z.string(), finished_at: nullableText,
  profiles: z.object({ full_name: nullableText }).nullable().optional(),
});

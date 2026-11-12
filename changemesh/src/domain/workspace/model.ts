import type { WorkspaceRole } from "../rbac/roles";

/** Enumerations mirror the PostgreSQL enums in supabase/migrations. */
export const ASSET_TYPES = ["website", "pdf", "csv", "manual", "product_catalog", "marketing_content"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export const SCAN_STATUSES = ["not_scanned", "queued", "running", "succeeded", "partial", "failed"] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];
export const RELATIONSHIP_TYPES = ["derived_from", "embeds", "links_to", "syncs_with", "references", "duplicates"] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];
export const RELATIONSHIP_STATUSES = ["suggested", "confirmed", "rejected"] as const;
export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];
export const RECORD_ORIGINS = ["manual", "rule", "ai", "scan", "demo", "system"] as const;
export type RecordOrigin = (typeof RECORD_ORIGINS)[number];
export const CHANGE_TYPES = ["created", "updated", "deleted", "conflicting", "outdated"] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];
export const CHANGE_STATUSES = ["draft", "analyzing", "analyzed", "pending_approval", "approved", "rejected", "completed", "cancelled"] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];
export const IMPACT_LEVELS = ["critical", "high", "medium", "low"] as const;
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];
export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "needs_revision"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export const EXECUTION_STATUSES = ["not_started", "ready", "in_progress", "completed", "failed"] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];
export const INTEGRATION_STATUSES = ["not_connected", "connected", "error", "disabled"] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];
export const SUBSCRIPTION_PLANS = ["starter", "business", "agency", "enterprise"] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  description: string | null;
  sourceUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  status: "active" | "archived";
  scanStatus: ScanStatus;
  lastScannedAt: string | null;
  lastScanError: string | null;
  currentVersion: number;
  isCustomerFacing: boolean;
  origin: RecordOrigin;
  createdAt: string;
  updatedAt: string;
}

export interface AssetVersion {
  id: string;
  assetId: string;
  version: number;
  contentHash: string | null;
  summary: Record<string, unknown>;
  createdAt: string;
}

export interface AssetRelationship {
  id: string;
  sourceAssetId: string;
  targetAssetId: string;
  type: RelationshipType;
  status: RelationshipStatus;
  confidence: number;
  origin: RecordOrigin;
  note: string | null;
  createdAt: string;
}

export interface Change {
  id: string;
  title: string;
  description: string | null;
  type: ChangeType;
  status: ChangeStatus;
  sourceAssetId: string | null;
  entityName: string | null;
  attributeName: string | null;
  oldValue: string | null;
  newValue: string | null;
  origin: RecordOrigin;
  createdAt: string;
  analysis?: ChangeAnalysis | null;
  analyzedAt?: string | null;
}

/** Metadata of the latest impact analysis of a change. */
export interface ChangeAnalysis {
  generatedBy: "rules" | "ai" | "demo";
  model?: string | null;
  summary: string;
  warnings: string[];
  counts: { critical: number; high: number; medium: number; low: number; direct: number; indirect: number; alreadyUpdated: number; inconsistencies: number };
  relatedFacts?: string[];
  usage?: { inputTokens: number; outputTokens: number; costUsd: number | null } | null;
  /** Per affected asset: why it is affected and (for AI analyses) the model's rationale. */
  notes?: Record<string, { reasons: string[]; rationale: string | null; currentValue: string | null; containsFact: boolean; inconsistent: boolean }>;
  skipped?: { assetId: string; reason: string }[];
}

export interface AiUsageRecord {
  id: string;
  changeId: string | null;
  model: string;
  status: "succeeded" | "failed" | "rejected_output";
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  createdAt: string;
}

export interface RelationshipPathStep {
  assetId: string;
  /** "contains": the changed source itself; "shares": the asset holds the same fact (no explicit relationship needed). */
  relationship: RelationshipType | "contains" | "shares";
}

export interface ChangeImpact {
  id: string;
  changeId: string;
  assetId: string;
  level: ImpactLevel;
  depth: number;
  path: RelationshipPathStep[];
  oldValue: string | null;
  newValue: string | null;
  confidence: number;
  recommendedAction: string | null;
  origin: RecordOrigin;
  createdAt: string;
}

export interface UpdateProposal {
  id: string;
  changeId: string;
  changeImpactId: string | null;
  targetAssetId: string;
  currentValue: string | null;
  proposedValue: string | null;
  reason: string | null;
  evidence: { label: string; detail?: string }[];
  impactLevel: ImpactLevel;
  approvalStatus: ApprovalStatus;
  executionStatus: ExecutionStatus;
  origin: RecordOrigin;
  createdAt: string;
  updatedAt: string;
  /** Sent to external systems so a retried update is applied at most once. */
  idempotencyKey?: string;
  executionResult?: Record<string, unknown> | null;
  executedAt?: string | null;
  revisionCount?: number;
}

export type ExecutionMode = "internal" | "manual" | "integration" | "simulation";

export interface UpdateExecution {
  id: string;
  proposalId: string;
  action: "execute" | "rollback" | "simulate";
  mode: ExecutionMode;
  status: "running" | "succeeded" | "failed";
  idempotencyKey: string;
  attempt: number;
  result: Record<string, unknown>;
  error: string | null;
  actorName: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface Approval {
  id: string;
  proposalId: string;
  decision: Exclude<ApprovalStatus, "pending">;
  comment: string | null;
  decidedBy: string;
  decidedByName: string | null;
  createdAt: string;
}

export interface Integration {
  id: string;
  provider: string;
  displayName: string;
  status: IntegrationStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface AuditEvent {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorType: "user" | "system" | "service";
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Member {
  userId: string;
  fullName: string | null;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
}

export interface Subscription {
  plan: SubscriptionPlan;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Everything a workspace page needs, already filtered to one workspace (by RLS or the demo store). */
export interface WorkspaceSnapshot {
  assets: Asset[];
  versions: AssetVersion[];
  relationships: AssetRelationship[];
  changes: Change[];
  impacts: ChangeImpact[];
  proposals: UpdateProposal[];
  approvals: Approval[];
  integrations: Integration[];
  audit: AuditEvent[];
  /** False when the viewer's role may not read the audit log (RLS hides it). */
  auditVisible: boolean;
  members: Member[];
  subscription: Subscription | null;
  /** Number of current facts per asset id. */
  factCounts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Asset Intelligence (Stage 3)
// ---------------------------------------------------------------------------
export type { ExtractionMethod, SourceLocation } from "../extraction/fact";
import type { ExtractionMethod, SourceLocation } from "../extraction/fact";

export interface ExtractedFact {
  id: string;
  assetId: string;
  /** null for manual facts (valid across versions). */
  assetVersion: number | null;
  scanId: string | null;
  entityName: string;
  attributeName: string;
  valueText: string;
  valueNumber: number | null;
  valueUnit: string | null;
  normalizedValue: string;
  location: SourceLocation;
  confidence: number;
  method: ExtractionMethod;
  origin: RecordOrigin;
  extractedAt: string;
}

export interface AssetScan {
  id: string;
  assetId: string;
  kind: "website" | "upload";
  status: ScanStatus;
  startedAt: string;
  finishedAt: string | null;
  assetVersion: number | null;
  factsCount: number;
  error: string | null;
  warnings: string[];
  stats: Record<string, unknown>;
}

export interface AssetIntelligence {
  /** Current facts: manual facts + facts of the current version. */
  facts: ExtractedFact[];
  scans: AssetScan[];
}

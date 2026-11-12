import type { WorkspaceRole } from "@/domain/rbac/roles";
import type { FactDraft } from "@/domain/extraction/fact";
import type { RelationshipSuggestion } from "@/domain/graph/suggest";
import type { CreateAssetInput, CreateChangeInput, CreateRelationshipInput, DecisionInput, UpdateAssetInput } from "@/domain/workspace/inputs";
import type { ImpactDraft } from "@/domain/changes/impact";
import type { ProposalDraft } from "@/domain/changes/proposals";
import type { AiUsageRecord, AssetIntelligence, ChangeAnalysis, ExtractedFact, RecordOrigin, WorkspaceSnapshot } from "@/domain/workspace/model";
import type { ScanResult } from "../intelligence/analyze";

export interface StoredFile {
  storagePath: string | null;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
}

export interface RecordedScan {
  assetVersion: number | null;
  newVersion: boolean;
  factsCount: number;
}

/**
 * Data access for one workspace. Two implementations:
 * - SupabaseWorkspaceData: real tenant data through RLS (src/server/data/supabase.ts)
 * - DemoWorkspaceData: fictional, per-session in-memory data (src/server/data/demo.ts)
 * Callers must check permissions first (see src/domain/rbac); the database enforces them again.
 */
export interface WorkspaceData {
  snapshot(): Promise<WorkspaceSnapshot>;
  createAsset(input: CreateAssetInput): Promise<{ id: string }>;
  updateAsset(input: UpdateAssetInput): Promise<void>;
  deleteAsset(assetId: string): Promise<void>;
  createChange(input: CreateChangeInput, opts?: { origin?: RecordOrigin }): Promise<{ id: string }>;
  decideProposal(input: DecisionInput): Promise<void>;
  reviewRelationship(id: string, status: "confirmed" | "rejected"): Promise<void>;
  updateMemberRole(userId: string, role: WorkspaceRole): Promise<void>;
  removeMember(userId: string): Promise<void>;
  renameWorkspace(name: string): Promise<void>;

  // Asset Intelligence
  assetIntelligence(assetId: string): Promise<AssetIntelligence>;
  startScan(assetId: string, kind: "website" | "upload"): Promise<string>;
  /** Keeps the original upload in private storage. Returns null where files are not stored (demo). */
  storeOriginal(assetId: string, file: { bytes: Uint8Array; contentType: string; hash: string; extension: string }): Promise<string | null>;
  recordScan(scanId: string, result: ScanResult, file?: StoredFile): Promise<RecordedScan>;
  addManualFact(assetId: string, fact: FactDraft): Promise<{ id: string }>;
  deleteFact(factId: string): Promise<void>;

  // Dependency graph
  /** Current facts of all active assets (capped; see implementations). */
  workspaceFacts(): Promise<ExtractedFact[]>;
  createRelationship(input: CreateRelationshipInput): Promise<{ id: string }>;
  deleteRelationship(id: string): Promise<void>;
  /** Stores rule-based suggestions; pairs that already exist are skipped. Returns how many were created. */
  addSuggestions(suggestions: RelationshipSuggestion[]): Promise<number>;

  // Change engine
  versionFacts(assetId: string, version: number): Promise<ExtractedFact[]>;
  saveChangeAnalysis(changeId: string, payload: SavedAnalysis): Promise<{ impactsSaved: number; proposalsCreated: number; proposalsKept: number; status: string }>;
  recordAiUsage(entry: AiUsageEntry): Promise<void>;
  aiUsage(): Promise<AiUsageRecord[]>;
}

export interface SavedAnalysis {
  impacts: (ImpactDraft & { origin: RecordOrigin })[];
  proposals: (ProposalDraft & { origin: RecordOrigin })[];
  analysis: ChangeAnalysis;
}

export interface AiUsageEntry {
  changeId: string | null;
  model: string;
  status: "succeeded" | "failed" | "rejected_output";
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  attempts: number;
  durationMs: number | null;
  error: string | null;
}

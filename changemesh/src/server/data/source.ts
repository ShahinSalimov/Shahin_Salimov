import type { WorkspaceRole } from "@/domain/rbac/roles";
import type { CreateAssetInput, CreateChangeInput, DecisionInput } from "@/domain/workspace/inputs";
import type { WorkspaceSnapshot } from "@/domain/workspace/model";

/**
 * Data access for one workspace. Two implementations:
 * - SupabaseWorkspaceData: real tenant data through RLS (src/server/data/supabase.ts)
 * - DemoWorkspaceData: fictional, per-session in-memory data (src/server/data/demo.ts)
 * Callers must check permissions first (see src/domain/rbac); the database enforces them again.
 */
export interface WorkspaceData {
  snapshot(): Promise<WorkspaceSnapshot>;
  createAsset(input: CreateAssetInput): Promise<{ id: string }>;
  createChange(input: CreateChangeInput): Promise<{ id: string }>;
  decideProposal(input: DecisionInput): Promise<void>;
  reviewRelationship(id: string, status: "confirmed" | "rejected"): Promise<void>;
  updateMemberRole(userId: string, role: WorkspaceRole): Promise<void>;
  removeMember(userId: string): Promise<void>;
  renameWorkspace(name: string): Promise<void>;
}

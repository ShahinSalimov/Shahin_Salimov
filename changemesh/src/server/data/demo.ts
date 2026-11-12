import "server-only";
import type { WorkspaceRole } from "@/domain/rbac/roles";
import type { CreateAssetInput, CreateChangeInput, DecisionInput } from "@/domain/workspace/inputs";
import type { AuditEvent, WorkspaceSnapshot } from "@/domain/workspace/model";
import { AppError, conflict, notFound } from "@/lib/errors";
import { getDemoSession } from "./demo-store";
import type { WorkspaceData } from "./source";

const VISITOR = { id: "demo-user-1", name: "Demo Visitor (you)" };

/** Demo implementation: mirrors the database rules so the demo behaves like the real product. */
export class DemoWorkspaceData implements WorkspaceData {
  constructor(private readonly sessionId: string) {}

  private get session() {
    return getDemoSession(this.sessionId);
  }

  private audit(action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) {
    const event: AuditEvent = {
      id: `e-${crypto.randomUUID()}`,
      actorId: VISITOR.id,
      actorName: VISITOR.name,
      actorType: "user",
      action,
      targetType,
      targetId,
      metadata,
      createdAt: new Date().toISOString(),
    };
    this.session.snapshot.audit.unshift(event);
  }

  async snapshot(): Promise<WorkspaceSnapshot> {
    return structuredClone(this.session.snapshot);
  }

  get workspaceName(): string {
    return this.session.workspaceName;
  }

  async createAsset(input: CreateAssetInput) {
    const now = new Date().toISOString();
    const id = `a-${crypto.randomUUID()}`;
    this.session.snapshot.assets.unshift({
      id,
      type: input.type,
      name: input.name,
      description: input.description,
      sourceUrl: input.sourceUrl,
      mimeType: null,
      sizeBytes: null,
      status: "active",
      scanStatus: "not_scanned",
      lastScannedAt: null,
      lastScanError: null,
      currentVersion: 0,
      isCustomerFacing: true,
      origin: "demo",
      createdAt: now,
      updatedAt: now,
    });
    this.audit("assets.insert", "assets", id, { name: input.name });
    return { id };
  }

  async createChange(input: CreateChangeInput) {
    const snap = this.session.snapshot;
    if (input.sourceAssetId && !snap.assets.some((a) => a.id === input.sourceAssetId)) throw notFound("Source asset not found.");
    const id = `c-${crypto.randomUUID()}`;
    snap.changes.unshift({
      id,
      title: input.title,
      description: input.description,
      type: input.type,
      status: "draft",
      sourceAssetId: input.sourceAssetId,
      entityName: input.entityName,
      attributeName: input.attributeName,
      oldValue: input.oldValue,
      newValue: input.newValue,
      origin: "demo",
      createdAt: new Date().toISOString(),
    });
    this.audit("changes.insert", "changes", id, { name: input.title, status: "draft" });
    return { id };
  }

  async decideProposal(input: DecisionInput) {
    const snap = this.session.snapshot;
    const p = snap.proposals.find((x) => x.id === input.proposalId);
    if (!p) throw notFound("Proposal not found.");
    if (p.approvalStatus === "approved" || p.approvalStatus === "rejected") throw conflict("This proposal has already been decided.");
    const now = new Date().toISOString();
    p.approvalStatus = input.decision;
    p.updatedAt = now;
    const approvalId = `ap-${crypto.randomUUID()}`;
    snap.approvals.unshift({ id: approvalId, proposalId: p.id, decision: input.decision, comment: input.comment, decidedBy: VISITOR.id, decidedByName: VISITOR.name, createdAt: now });
    this.audit("update_proposals.update", "update_proposals", p.id, { changed: ["approval_status"], status: input.decision });
    this.audit("approvals.insert", "approvals", approvalId, { decision: input.decision });
  }

  async reviewRelationship(id: string, status: "confirmed" | "rejected") {
    const r = this.session.snapshot.relationships.find((x) => x.id === id);
    if (!r) throw notFound("Relationship not found.");
    r.status = status;
    this.audit("asset_relationships.update", "asset_relationships", id, { changed: ["status"], status });
  }

  async updateMemberRole(userId: string, role: WorkspaceRole) {
    const members = this.session.snapshot.members;
    const m = members.find((x) => x.userId === userId);
    if (!m) throw notFound("Member not found.");
    if (m.role === "owner" && role !== "owner" && members.filter((x) => x.role === "owner").length === 1) {
      throw new AppError("VALIDATION_FAILED", "A workspace must have at least one owner.");
    }
    m.role = role;
    this.audit("workspace_members.update", "workspace_members", userId, { changed: ["role"], role, user_id: userId });
  }

  async removeMember(userId: string) {
    const snap = this.session.snapshot;
    const m = snap.members.find((x) => x.userId === userId);
    if (!m) throw notFound("Member not found.");
    if (m.role === "owner" && snap.members.filter((x) => x.role === "owner").length === 1) {
      throw new AppError("VALIDATION_FAILED", "A workspace must have at least one owner.");
    }
    snap.members = snap.members.filter((x) => x.userId !== userId);
    this.audit("workspace_members.delete", "workspace_members", userId, { role: m.role, user_id: userId });
  }

  async renameWorkspace(name: string) {
    this.session.workspaceName = name;
    this.audit("workspaces.update", "workspaces", "demo", { changed: ["name"], name });
  }
}

import "server-only";
import type { WorkspaceRole } from "@/domain/rbac/roles";
import type { FactDraft } from "@/domain/extraction/fact";
import type { RelationshipSuggestion } from "@/domain/graph/suggest";
import type { CreateAssetInput, CreateChangeInput, CreateRelationshipInput, DecisionInput, UpdateAssetInput } from "@/domain/workspace/inputs";
import type { AssetIntelligence, AssetRelationship, AuditEvent, ExtractedFact, WorkspaceSnapshot } from "@/domain/workspace/model";
import type { ScanResult } from "../intelligence/analyze";
import { AppError, conflict, notFound } from "@/lib/errors";
import { getDemoSession } from "./demo-store";
import type { RecordedScan, StoredFile, WorkspaceData } from "./source";

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
    const { snapshot, facts } = this.session;
    const current = new Map(snapshot.assets.map((a) => [a.id, a.currentVersion]));
    const factCounts: Record<string, number> = {};
    for (const f of facts) {
      if (f.assetVersion === null || f.assetVersion === current.get(f.assetId)) factCounts[f.assetId] = (factCounts[f.assetId] ?? 0) + 1;
    }
    return structuredClone({ ...snapshot, factCounts });
  }

  private asset(assetId: string) {
    const a = this.session.snapshot.assets.find((x) => x.id === assetId);
    if (!a) throw notFound("Asset not found.");
    return a;
  }

  async updateAsset(input: UpdateAssetInput) {
    const a = this.asset(input.assetId);
    if (a.type === "website" && !input.sourceUrl) throw new AppError("VALIDATION_FAILED", "Websites need a URL.", { fieldErrors: { sourceUrl: ["Websites need a URL."] } });
    Object.assign(a, { name: input.name, description: input.description, sourceUrl: input.sourceUrl, isCustomerFacing: input.isCustomerFacing, updatedAt: new Date().toISOString() });
    this.audit("assets.update", "assets", a.id, { changed: ["description", "is_customer_facing", "name", "source_url"], name: a.name });
  }

  async deleteAsset(assetId: string) {
    const a = this.asset(assetId);
    const s = this.session;
    const snap = s.snapshot;
    snap.assets = snap.assets.filter((x) => x.id !== assetId);
    snap.relationships = snap.relationships.filter((r) => r.sourceAssetId !== assetId && r.targetAssetId !== assetId);
    snap.versions = snap.versions.filter((v) => v.assetId !== assetId);
    snap.impacts = snap.impacts.filter((i) => i.assetId !== assetId);
    snap.proposals = snap.proposals.filter((p) => p.targetAssetId !== assetId);
    for (const c of snap.changes) if (c.sourceAssetId === assetId) c.sourceAssetId = null;
    s.facts = s.facts.filter((f) => f.assetId !== assetId);
    s.scans = s.scans.filter((x) => x.assetId !== assetId);
    this.audit("assets.delete", "assets", assetId, { name: a.name });
  }

  async assetIntelligence(assetId: string): Promise<AssetIntelligence> {
    const a = this.asset(assetId);
    return structuredClone({
      facts: this.session.facts.filter((f) => f.assetId === assetId && (f.assetVersion === null || f.assetVersion === a.currentVersion)),
      scans: this.session.scans.filter((x) => x.assetId === assetId).sort((x, y) => Date.parse(y.startedAt) - Date.parse(x.startedAt)),
    });
  }

  async startScan(assetId: string, kind: "website" | "upload") {
    const a = this.asset(assetId);
    if (this.session.scans.some((x) => x.assetId === assetId && x.status === "running")) throw conflict("A scan is already running for this asset.");
    const id = `s-${crypto.randomUUID()}`;
    this.session.scans.unshift({ id, assetId, kind, status: "running", startedAt: new Date().toISOString(), finishedAt: null, assetVersion: null, factsCount: 0, error: null, warnings: [], stats: {} });
    a.scanStatus = "running";
    return id;
  }

  async storeOriginal(): Promise<string | null> {
    return null; // Demo uploads are analyzed in memory and never stored.
  }

  async recordScan(scanId: string, result: ScanResult, file?: StoredFile): Promise<RecordedScan> {
    const s = this.session;
    const scan = s.scans.find((x) => x.id === scanId);
    if (!scan) throw notFound("Scan not found.");
    if (scan.status !== "running") throw conflict("This scan has already finished.");
    const a = this.asset(scan.assetId);
    const now = new Date().toISOString();
    let version = a.currentVersion;
    let newVersion = false;
    let count = 0;
    if (result.status !== "failed") {
      const latest = s.snapshot.versions.filter((v) => v.assetId === a.id).sort((x, y) => y.version - x.version)[0];
      if (latest?.contentHash !== result.contentHash) {
        newVersion = true;
        version = a.currentVersion + 1;
        s.snapshot.versions.push({ id: `v-${crypto.randomUUID()}`, assetId: a.id, version, contentHash: result.contentHash, summary: result.summary, createdAt: now });
        result.facts.forEach((f) => s.facts.push(toFact(f, a.id, version, scanId, now)));
        count = result.facts.length;
      } else {
        count = s.facts.filter((f) => f.assetId === a.id && f.assetVersion === version).length;
      }
      Object.assign(a, { scanStatus: result.status, lastScannedAt: now, lastScanError: result.status === "partial" ? result.error : null, currentVersion: version, updatedAt: now });
      if (file) Object.assign(a, { mimeType: file.mimeType, sizeBytes: file.sizeBytes });
    } else {
      Object.assign(a, { scanStatus: "failed", lastScannedAt: now, lastScanError: result.error, updatedAt: now });
    }
    Object.assign(scan, { status: result.status, finishedAt: now, assetVersion: result.status === "failed" ? null : version || null, factsCount: count, error: result.error, warnings: result.warnings, stats: result.stats });
    this.audit("assets.update", "assets", a.id, { changed: ["last_scanned_at", "scan_status"], status: result.status, name: a.name });
    return { assetVersion: version || null, newVersion, factsCount: count };
  }

  async workspaceFacts(): Promise<ExtractedFact[]> {
    const { snapshot, facts } = this.session;
    const current = new Map(snapshot.assets.filter((a) => a.status === "active").map((a) => [a.id, a.currentVersion]));
    return structuredClone(facts.filter((f) => current.has(f.assetId) && (f.assetVersion === null || f.assetVersion === current.get(f.assetId))));
  }

  private pairTaken(a: string, b: string, type?: string) {
    return this.session.snapshot.relationships.some(
      (r) => ((r.sourceAssetId === a && r.targetAssetId === b) || (r.sourceAssetId === b && r.targetAssetId === a)) && (!type || r.type === type),
    );
  }

  async createRelationship(input: CreateRelationshipInput) {
    this.asset(input.sourceAssetId);
    this.asset(input.targetAssetId);
    if (this.pairTaken(input.sourceAssetId, input.targetAssetId, input.type)) throw conflict("These assets already have a relationship of this type.");
    const r: AssetRelationship = { id: `r-${crypto.randomUUID()}`, sourceAssetId: input.sourceAssetId, targetAssetId: input.targetAssetId, type: input.type, status: "confirmed", confidence: 1, origin: "manual", note: input.note, createdAt: new Date().toISOString() };
    this.session.snapshot.relationships.push(r);
    this.audit("asset_relationships.insert", "asset_relationships", r.id, { status: "confirmed" });
    return { id: r.id };
  }

  async deleteRelationship(id: string) {
    const snap = this.session.snapshot;
    if (!snap.relationships.some((r) => r.id === id)) throw notFound("Relationship not found.");
    snap.relationships = snap.relationships.filter((r) => r.id !== id);
    this.audit("asset_relationships.delete", "asset_relationships", id, {});
  }

  async addSuggestions(suggestions: RelationshipSuggestion[]) {
    let created = 0;
    for (const s of suggestions) {
      if (this.pairTaken(s.sourceAssetId, s.targetAssetId)) continue;
      const id = `r-${crypto.randomUUID()}`;
      this.session.snapshot.relationships.push({ id, sourceAssetId: s.sourceAssetId, targetAssetId: s.targetAssetId, type: s.type, status: "suggested", confidence: s.confidence, origin: "rule", note: s.note, createdAt: new Date().toISOString() });
      this.audit("asset_relationships.insert", "asset_relationships", id, { status: "suggested" });
      created++;
    }
    return created;
  }

  async addManualFact(assetId: string, fact: FactDraft) {
    this.asset(assetId);
    const f = toFact(fact, assetId, null, null, new Date().toISOString());
    this.session.facts.push(f);
    this.audit("extracted_facts.insert", "extracted_facts", f.id, {});
    return { id: f.id };
  }

  async deleteFact(factId: string) {
    const f = this.session.facts.find((x) => x.id === factId);
    if (!f) throw notFound("Fact not found.");
    if (f.method !== "manual") throw new AppError("VALIDATION_FAILED", "Only manually entered facts can be deleted. Scanned facts change when the asset is scanned again.");
    this.session.facts = this.session.facts.filter((x) => x.id !== factId);
    this.audit("extracted_facts.delete", "extracted_facts", factId, {});
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

function toFact(f: FactDraft, assetId: string, assetVersion: number | null, scanId: string | null, at: string) {
  return {
    id: `f-${crypto.randomUUID()}`,
    assetId,
    assetVersion,
    scanId,
    entityName: f.entityName,
    attributeName: f.attributeName,
    valueText: f.valueText,
    valueNumber: f.valueNumber,
    valueUnit: f.valueUnit,
    normalizedValue: f.normalizedValue,
    location: f.location,
    confidence: f.confidence,
    method: f.method,
    origin: (f.method === "manual" ? "manual" : "scan") as "manual" | "scan",
    extractedAt: at,
  };
}

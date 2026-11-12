import "server-only";
import type { AiUsageRecord, AssetScan, ExtractedFact, UpdateExecution, WorkspaceSnapshot } from "@/domain/workspace/model";
import type { NotificationView } from "../commercial/views";
import { demoWorkspace } from "../demo/fixture";
import { buildDemoSnapshot } from "../demo/seed";
import { buildDemoIntelligence } from "../demo/seed-intelligence";

/**
 * In-memory demo state, one copy per demo session (cookie id).
 * Fictional data only. Lost on server restart and NOT shared between server
 * instances — acceptable for a demo, documented in DEVELOPMENT_STATUS.md.
 */
export interface DemoSession {
  snapshot: WorkspaceSnapshot;
  facts: ExtractedFact[];
  scans: AssetScan[];
  aiUsage?: AiUsageRecord[];
  executions?: UpdateExecution[];
  notifications?: NotificationView[];
  workspaceName: string;
  touchedAt: number;
}

const TTL_MS = 8 * 3600_000;
const MAX_SESSIONS = 500;
const globalStore = globalThis as unknown as { __changemeshDemo?: Map<string, DemoSession> };
const sessions = (globalStore.__changemeshDemo ??= new Map());

function evict(now: number) {
  for (const [id, s] of sessions) if (now - s.touchedAt > TTL_MS) sessions.delete(id);
  while (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }
}

export function getDemoSession(sessionId: string): DemoSession {
  const now = Date.now();
  let session = sessions.get(sessionId);
  if (!session) {
    evict(now);
    const snapshot = buildDemoSnapshot(new Date(now));
    const { facts, scans, versions } = buildDemoIntelligence(snapshot.assets, new Date(now), snapshot.versions);
    snapshot.versions.push(...versions);
    // Sample execution history for updates that the seed marks as completed.
    const executions = snapshot.proposals
      .filter((p) => p.executionStatus === "completed")
      .map((p) => ({
        id: `x-${p.id}`,
        proposalId: p.id,
        action: "execute" as const,
        mode: "manual" as const,
        status: "succeeded" as const,
        idempotencyKey: p.idempotencyKey ?? p.id,
        attempt: 1,
        result: { ...(p.executionResult ?? {}), confirmedBy: "Maya Chen" },
        error: null,
        actorName: "Maya Chen",
        startedAt: p.executedAt ?? p.updatedAt,
        finishedAt: p.executedAt ?? p.updatedAt,
      }));
    const ago = (min: number) => new Date(now - min * 60_000).toISOString();
    const pending = snapshot.changes.find((c) => c.status === "pending_approval");
    const failed = snapshot.assets.find((a) => a.scanStatus === "failed");
    // Sample notifications that mirror what the database triggers create for real accounts.
    const notifications: NotificationView[] = [
      ...(pending ? [{ id: "n-1", kind: "approval_needed" as const, title: "Updates need your approval", body: pending.title, link: `/w/${demoWorkspace.id}/approvals`, readAt: null, createdAt: ago(42) }] : []),
      ...(failed ? [{ id: "n-2", kind: "scan_failed" as const, title: `A scan failed: ${failed.name}`, body: failed.lastScanError, link: `/w/${demoWorkspace.id}/assets/${failed.id}`, readAt: null, createdAt: ago(180) }] : []),
    ];
    session = { snapshot, facts, scans, executions, notifications, workspaceName: demoWorkspace.name, touchedAt: now };
    sessions.set(sessionId, session);
  }
  session.touchedAt = now;
  return session;
}

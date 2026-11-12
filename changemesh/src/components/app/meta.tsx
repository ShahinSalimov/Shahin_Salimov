import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock3,
  FileSpreadsheet,
  FileText,
  Globe,
  Loader2,
  type LucideIcon,
  Megaphone,
  NotebookPen,
  Package,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trash2,
  XCircle,
  GitCompareArrows,
  History,
  PlusCircle,
  RefreshCw,
} from "lucide-react";
import type {
  ApprovalStatus,
  AssetType,
  ChangeStatus,
  ChangeType,
  ExecutionStatus,
  ImpactLevel,
  RelationshipStatus,
  RelationshipType,
  ScanStatus,
} from "@/domain/workspace/model";
import type { AssetHealth } from "@/domain/insights/metrics";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "primary" | "critical" | "high" | "medium" | "low";
export interface StatusMeta {
  label: string;
  tone: Tone;
  icon: LucideIcon;
}

export const ASSET_TYPE_META: Record<AssetType, { label: string; plural: string; icon: LucideIcon }> = {
  website: { label: "Website", plural: "Websites", icon: Globe },
  pdf: { label: "PDF document", plural: "PDF documents", icon: FileText },
  csv: { label: "CSV spreadsheet", plural: "Spreadsheets", icon: FileSpreadsheet },
  manual: { label: "Manual record", plural: "Manual records", icon: NotebookPen },
  product_catalog: { label: "Product catalog", plural: "Product catalogs", icon: Package },
  marketing_content: { label: "Marketing content", plural: "Marketing content", icon: Megaphone },
};

export const SCAN_STATUS_META: Record<ScanStatus, StatusMeta> = {
  not_scanned: { label: "Not scanned", tone: "neutral", icon: CircleDashed },
  queued: { label: "Queued", tone: "info", icon: Clock3 },
  running: { label: "Scanning", tone: "info", icon: Loader2 },
  succeeded: { label: "Scanned", tone: "success", icon: CheckCircle2 },
  partial: { label: "Partially scanned", tone: "warning", icon: AlertTriangle },
  failed: { label: "Scan failed", tone: "danger", icon: XCircle },
};

export const HEALTH_META: Record<AssetHealth, StatusMeta & { description: string }> = {
  healthy: { label: "In sync", tone: "success", icon: CheckCircle2, description: "Scanned and not affected by open changes" },
  outdated: { label: "Outdated", tone: "warning", icon: RotateCcw, description: "Affected by an open change that is not applied yet" },
  scan_issue: { label: "Scan issue", tone: "danger", icon: ShieldAlert, description: "Last scan failed or was incomplete" },
  unscanned: { label: "Not verified", tone: "neutral", icon: CircleDashed, description: "Not scanned yet — content not verified" },
};

export const IMPACT_META: Record<ImpactLevel, StatusMeta> = {
  critical: { label: "Critical", tone: "critical", icon: ShieldAlert },
  high: { label: "High", tone: "high", icon: AlertTriangle },
  medium: { label: "Medium", tone: "medium", icon: CircleDot },
  low: { label: "Low", tone: "low", icon: CircleDot },
};

export const APPROVAL_META: Record<ApprovalStatus, StatusMeta> = {
  pending: { label: "Pending", tone: "info", icon: Clock3 },
  approved: { label: "Approved", tone: "success", icon: CheckCircle2 },
  rejected: { label: "Rejected", tone: "danger", icon: XCircle },
  needs_revision: { label: "Needs revision", tone: "warning", icon: RotateCcw },
};

export const EXECUTION_META: Record<ExecutionStatus, StatusMeta> = {
  not_started: { label: "Not started", tone: "neutral", icon: PauseCircle },
  ready: { label: "Ready", tone: "info", icon: PlayCircle },
  in_progress: { label: "In progress", tone: "info", icon: Loader2 },
  completed: { label: "Completed", tone: "success", icon: CheckCircle2 },
  failed: { label: "Failed", tone: "danger", icon: XCircle },
};

export const CHANGE_TYPE_META: Record<ChangeType, StatusMeta> = {
  created: { label: "Created", tone: "success", icon: PlusCircle },
  updated: { label: "Updated", tone: "primary", icon: RefreshCw },
  deleted: { label: "Deleted", tone: "danger", icon: Trash2 },
  conflicting: { label: "Conflicting", tone: "warning", icon: GitCompareArrows },
  outdated: { label: "Outdated", tone: "warning", icon: History },
};

export const CHANGE_STATUS_META: Record<ChangeStatus, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral", icon: CircleDashed },
  analyzing: { label: "Analyzing", tone: "info", icon: Loader2 },
  analyzed: { label: "Analyzed", tone: "info", icon: Sparkles },
  pending_approval: { label: "Awaiting approval", tone: "warning", icon: Clock3 },
  approved: { label: "Approved", tone: "success", icon: CheckCircle2 },
  rejected: { label: "Rejected", tone: "danger", icon: XCircle },
  completed: { label: "Completed", tone: "success", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", tone: "neutral", icon: Ban },
};

export const RELATIONSHIP_STATUS_META: Record<RelationshipStatus, StatusMeta> = {
  suggested: { label: "Suggested", tone: "info", icon: Sparkles },
  confirmed: { label: "Confirmed", tone: "success", icon: CheckCircle2 },
  rejected: { label: "Rejected", tone: "neutral", icon: XCircle },
};

export const RELATIONSHIP_LABEL: Record<RelationshipType | "contains" | "shares", string> = {
  derived_from: "derived from",
  embeds: "embeds",
  links_to: "links to",
  syncs_with: "syncs with",
  references: "references",
  duplicates: "duplicates",
  contains: "source",
  shares: "same information",
};

/** Wording when reading a relationship from the target's side. */
export const RELATIONSHIP_INCOMING_LABEL: Record<RelationshipType, string> = {
  derived_from: "source for",
  embeds: "embedded in",
  links_to: "linked from",
  syncs_with: "syncs with",
  references: "referenced by",
  duplicates: "duplicates",
};

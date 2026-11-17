import type { SeverityLabel, ThreatSource } from "./types";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function severityLabel(score: number | null | undefined): SeverityLabel {
  if (score == null) return "info";
  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  if (score > 0) return "low";
  return "info";
}

export const SEVERITY_STYLES: Record<SeverityLabel, { badge: string; bar: string; text: string }> = {
  critical: { badge: "bg-red-500/15 text-red-300 ring-red-500/40", bar: "bg-red-500", text: "text-red-300" },
  high: { badge: "bg-orange-500/15 text-orange-300 ring-orange-500/40", bar: "bg-orange-500", text: "text-orange-300" },
  medium: { badge: "bg-amber-400/15 text-amber-200 ring-amber-400/40", bar: "bg-amber-400", text: "text-amber-200" },
  low: { badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40", bar: "bg-emerald-500", text: "text-emerald-300" },
  info: { badge: "bg-slate-500/15 text-slate-300 ring-slate-500/40", bar: "bg-slate-500", text: "text-slate-300" },
};

export const SOURCE_LABELS: Record<ThreatSource, string> = {
  darkweb: "DarkWeb",
  telegram: "Telegram OSINT",
  paste: "Paste Site",
  nvd: "NVD CVE",
  manual: "Manual",
  simulator: "Simulator",
};

export const SOURCE_STYLES: Record<ThreatSource, string> = {
  darkweb: "text-fuchsia-300 bg-fuchsia-500/10 ring-fuchsia-500/30",
  telegram: "text-sky-300 bg-sky-500/10 ring-sky-500/30",
  paste: "text-violet-300 bg-violet-500/10 ring-violet-500/30",
  nvd: "text-cyan-300 bg-cyan-500/10 ring-cyan-500/30",
  manual: "text-slate-300 bg-slate-500/10 ring-slate-500/30",
  simulator: "text-slate-300 bg-slate-500/10 ring-slate-500/30",
};

export const STAGES = [
  { key: "triage", label: "Agent 1", name: "Triage & IoCs" },
  { key: "context", label: "Agent 2", name: "ATT&CK Context" },
  { key: "remediation", label: "Agent 3", name: "Remediation" },
] as const;

export function stageIndex(stage: string | null): number {
  if (!stage || stage === "queued" || stage === "sanitize") return -1;
  if (stage === "postprocess") return 3;
  return STAGES.findIndex((s) => s.key === stage);
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "-";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function truncateMiddle(value: string, max = 28): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(-half)}`;
}

import { Badge } from "@/components/ui/primitives";
import { cn, SEVERITY_STYLES, severityLabel, SOURCE_LABELS, SOURCE_STYLES } from "@/lib/format";
import type { ThreatSource } from "@/lib/types";

export function SeverityBadge({ score, className }: { score: number | null | undefined; className?: string }) {
  const label = severityLabel(score);
  return (
    <Badge className={cn(SEVERITY_STYLES[label].badge, className)}>
      {label}
      {score != null ? <span className="font-mono tabular-nums opacity-90">{score.toFixed(1)}</span> : null}
    </Badge>
  );
}

export function SourceTag({ source }: { source: ThreatSource }) {
  return <Badge className={SOURCE_STYLES[source]}>{SOURCE_LABELS[source]}</Badge>;
}

export function ExposureTag({ exposure }: { exposure: string | null | undefined }) {
  if (!exposure) return null;
  const style =
    exposure === "direct"
      ? "text-red-200 bg-red-500/10 ring-red-500/30"
      : exposure === "indirect"
        ? "text-amber-200 bg-amber-500/10 ring-amber-500/30"
        : "text-slate-400 bg-slate-500/10 ring-slate-500/20";
  return <Badge className={style}>{exposure === "none" ? "not exposed" : `${exposure} exposure`}</Badge>;
}

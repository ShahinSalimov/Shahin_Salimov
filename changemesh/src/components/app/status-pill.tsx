import { cn } from "@/lib/utils";
import type { StatusMeta, Tone } from "./meta";

const TONE: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  success: "bg-success/10 text-success ring-success/25",
  warning: "bg-warning/12 text-[color-mix(in_oklch,var(--warning),var(--foreground)_35%)] ring-warning/30",
  danger: "bg-destructive/10 text-destructive ring-destructive/25",
  info: "bg-info/10 text-info ring-info/25",
  primary: "bg-primary/10 text-primary ring-primary/25",
  critical: "bg-level-critical/12 text-level-critical ring-level-critical/30",
  high: "bg-level-high/12 text-[color-mix(in_oklch,var(--level-high),var(--foreground)_20%)] ring-level-high/30",
  medium: "bg-level-medium/15 text-[color-mix(in_oklch,var(--level-medium),var(--foreground)_45%)] ring-level-medium/35",
  low: "bg-level-low/12 text-[color-mix(in_oklch,var(--level-low),var(--foreground)_25%)] ring-level-low/30",
};

export function toneClass(tone: Tone): string {
  return TONE[tone];
}

export function StatusPill({ meta, className, size = "sm" }: { meta: StatusMeta; className?: string; size?: "sm" | "xs" }) {
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full font-medium whitespace-nowrap ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-1.5 py-px text-[11px]",
        TONE[meta.tone],
        className,
      )}
    >
      <Icon className={cn(size === "sm" ? "size-3" : "size-2.5", meta.icon.displayName === "Loader2" && "animate-spin")} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/** Marks fictional demo records explicitly. */
export function SampleTag({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded border border-dashed border-warning/60 px-1.5 py-px text-[10px] font-medium tracking-wide text-muted-foreground uppercase", className)}>
      Sample
    </span>
  );
}

/** For capabilities that exist in the roadmap but are not built yet. */
export function PlannedTag({ stage, className }: { stage: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground", className)}>
      Planned · {stage}
    </span>
  );
}

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  href,
  emphasis,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  hint?: React.ReactNode;
  href?: string;
  emphasis?: "warning" | "danger";
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            "grid size-7 place-items-center rounded-md bg-muted text-muted-foreground",
            emphasis === "warning" && "bg-warning/15 text-[color-mix(in_oklch,var(--warning),var(--foreground)_35%)]",
            emphasis === "danger" && "bg-destructive/10 text-destructive",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="tabular text-3xl font-semibold tracking-tight">{value}</span>
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      {href ? <ArrowUpRight className="absolute right-3 bottom-3 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" /> : null}
    </>
  );
  const cls = "group relative rounded-xl border bg-card p-4 shadow-[0_1px_2px_0_rgb(0_0_0/0.03)] transition-colors";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-2")} aria-label={`${label}: ${value}`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

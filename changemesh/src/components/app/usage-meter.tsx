import { usageRatio } from "@/domain/billing/plans";
import { cn } from "@/lib/utils";

export function UsageMeter({ label, used, limit, note }: { label: string; used: number; limit: number | null; note?: string }) {
  const ratio = usageRatio(used, limit);
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">
        <span className="tabular text-xl font-semibold">{used.toLocaleString("en")}</span>
        <span className="text-muted-foreground"> / {limit === null ? "∞" : limit.toLocaleString("en")}</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit ?? undefined}>
        {ratio !== null ? <div className={cn("h-full rounded-full", ratio >= 0.9 ? "bg-destructive" : ratio >= 0.7 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.max(ratio * 100, 2)}%` }} /> : null}
      </div>
      {note ? <p className="mt-1 text-[11px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

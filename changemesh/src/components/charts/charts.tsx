import Link from "next/link";
import { cn } from "@/lib/utils";

export interface Segment {
  key: string;
  label: string;
  value: number;
  /** Tailwind background class, e.g. "bg-level-critical". */
  color: string;
  /** CSS colour for SVG strokes, e.g. "var(--level-critical)". */
  stroke?: string;
  href?: string;
}

/** Single stacked bar with legend. Every value is also printed as text. */
export function StackedBar({ segments, total, className, label, compact = false }: { segments: Segment[]; total?: number; className?: string; label: string; compact?: boolean }) {
  const sum = total ?? segments.reduce((a, s) => a + s.value, 0);
  return (
    <div className={className}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
        {sum > 0
          ? segments.map((s) => (s.value > 0 ? <div key={s.key} className={cn("h-full first:rounded-l-full last:rounded-r-full", s.color)} style={{ width: `${(s.value / sum) * 100}%` }} /> : null))
          : null}
      </div>
      <ul className={cn("mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs", !compact && "sm:grid-cols-4")}>
        {segments.map((s) => {
          const content = (
            <>
              <span className={cn("size-2 shrink-0 rounded-full", s.color)} aria-hidden="true" />
              <span className="truncate text-muted-foreground">{s.label}</span>
              <span className="tabular ml-auto font-medium">{s.value}</span>
            </>
          );
          return (
            <li key={s.key}>
              {s.href ? (
                <Link href={s.href} className="flex items-center gap-2 rounded px-1 -mx-1 hover:bg-muted">
                  {content}
                </Link>
              ) : (
                <div className="flex items-center gap-2">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Ring chart. Decorative SVG + accessible text legend. */
export function Donut({ segments, centerValue, centerLabel, size = 132 }: { segments: Segment[]; centerValue: React.ReactNode; centerLabel: string; size?: number }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const gap = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 1.5 : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" className="stroke-muted" />
        {total > 0
          ? segments.map((s) => {
              if (s.value === 0) return null;
              const len = (s.value / total) * c;
              const el = (
                <circle
                  key={s.key}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  strokeWidth="10"
                  strokeDasharray={`${Math.max(len - gap, 0.5)} ${c}`}
                  strokeDashoffset={-offset}
                  style={{ stroke: s.stroke ?? "currentColor" }}
                  strokeLinecap="butt"
                />
              );
              offset += len;
              return el;
            })
          : null}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="tabular text-2xl font-semibold tracking-tight">{centerValue}</div>
          <div className="text-[11px] text-muted-foreground">{centerLabel}</div>
        </div>
      </div>
    </div>
  );
}

/** Horizontal bars, each row linkable. */
export function BarList({ items, emptyLabel = "No data" }: { items: { key: string; label: React.ReactNode; value: number; href?: string; color?: string; meta?: React.ReactNode }[]; emptyLabel?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="grid gap-1">
      {items.map((i) => {
        const row = (
          <div className="relative flex items-center gap-3 rounded-md px-2 py-1.5">
            <div className={cn("absolute inset-y-0 left-0 rounded-md opacity-15", i.color ?? "bg-primary")} style={{ width: `${(i.value / max) * 100}%` }} aria-hidden="true" />
            <div className="relative min-w-0 flex-1 truncate text-sm">{i.label}</div>
            {i.meta ? <div className="relative hidden shrink-0 sm:block">{i.meta}</div> : null}
            <div className="tabular relative w-8 shrink-0 text-right text-sm font-medium">{i.value}</div>
          </div>
        );
        return (
          <li key={i.key}>
            {i.href ? (
              <Link href={i.href} className="block rounded-md hover:bg-muted/60 focus-visible:outline-2">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Weekly trend as columns with a text summary for screen readers. */
export function TrendBars({ points, label }: { points: { key: string; value: number; caption: string }[]; label: string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div>
      <p className="sr-only">
        {label}: {points.map((p) => `${p.caption} ${p.value}`).join(", ")}
      </p>
      <div className="flex h-20 items-end gap-1.5" aria-hidden="true">
        {points.map((p, idx) => (
          <div key={p.key} className="flex h-full flex-1 flex-col items-center justify-end">
            <div
              className={cn("w-full rounded-sm transition-all", idx === points.length - 1 ? "bg-primary" : "bg-primary/35")}
              style={{ height: `${Math.max((p.value / max) * 100, p.value ? 8 : 3)}%` }}
              title={`${p.caption}: ${p.value}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground" aria-hidden="true">
        <span>{points[0]?.caption}</span>
        <span>This week</span>
      </div>
    </div>
  );
}

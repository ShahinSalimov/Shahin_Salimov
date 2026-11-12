import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Builds a URL that keeps existing query params and overrides some. */
export function withParams(pathname: string, current: Record<string, string | undefined>, patch: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function FilterChips({ options, active, label }: { options: { value: string; label: string; count?: number; href: string }[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1">
      {options.map((o) => {
        const isActive = o.value === active;
        return (
          <Link
            key={o.value}
            href={o.href}
            scroll={false}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2",
              isActive && "border-foreground/15 bg-foreground text-background hover:bg-foreground/90 hover:text-background",
            )}
          >
            {o.label}
            {o.count !== undefined ? <span className={cn("tabular text-xs", isActive ? "text-background/70" : "text-muted-foreground/80")}>{o.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** GET search form: works without JavaScript and keeps other filters as hidden fields. */
export function SearchForm({ action, defaultValue, placeholder, keep }: { action: string; defaultValue?: string; placeholder: string; keep?: Record<string, string | undefined> }) {
  return (
    <form action={action} method="get" role="search" className="relative w-full sm:w-72">
      {Object.entries(keep ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </form>
  );
}

export function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

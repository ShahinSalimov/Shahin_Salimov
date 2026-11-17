"use client";

import { LoaderCircle, X } from "lucide-react";
import { Component, type ButtonHTMLAttributes, type ErrorInfo, type ReactNode, useEffect } from "react";

import { cn } from "@/lib/format";

type Variant = "primary" | "danger" | "ghost" | "outline" | "success";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40 hover:bg-cyan-500/25",
  danger: "bg-red-600/90 text-white ring-1 ring-red-400/60 hover:bg-red-500 shadow-[0_0_24px_-6px_rgba(239,68,68,0.7)]",
  ghost: "text-slate-300 hover:bg-white/5",
  outline: "text-slate-200 ring-1 ring-ink-600 hover:bg-white/5 hover:ring-ink-500",
  success: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-500/25",
};

export function Button({
  variant = "outline",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        VARIANTS[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  title,
  icon,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col rounded-lg border border-ink-700 bg-ink-900/80 backdrop-blur", className)}>
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-3 py-2">
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {icon}
            {title}
          </h2>
          {actions}
        </header>
      ) : null}
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-400" role="status">
      <LoaderCircle className="h-4 w-4 animate-spin text-cyan-400" aria-hidden />
      {label ?? "Loading…"}
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="text-slate-600">{icon}</div>
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Overlay({
  open,
  onClose,
  title,
  side = "center",
  children,
  widthClass = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  side?: "center" | "right";
  children: ReactNode;
  widthClass?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 flex max-h-full w-full flex-col border-ink-600 bg-ink-900 shadow-2xl",
          side === "right" ? "ml-auto h-full border-l sm:max-w-xl" : cn("m-auto max-h-[90vh] rounded-xl border", widthClass),
        )}
      >
        <header className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: T; label: string; count?: number }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-ink-700 px-2" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "relative whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors",
            active === t.key ? "text-cyan-200" : "text-slate-400 hover:text-slate-200",
          )}
        >
          {t.label}
          {t.count != null ? <span className="ml-1.5 rounded bg-ink-700 px-1 text-[10px] text-slate-300">{t.count}</span> : null}
          {active === t.key ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-cyan-400" /> : null}
        </button>
      ))}
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm">
          <p className="font-medium text-red-300">{this.props.label} failed to render</p>
          <p className="mt-1 font-mono text-xs text-red-200/70">{this.state.error.message}</p>
          <Button size="sm" className="mt-3" onClick={() => this.setState({ error: null })}>
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

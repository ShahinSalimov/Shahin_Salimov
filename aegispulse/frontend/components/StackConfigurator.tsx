"use client";

import { Check, Layers, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { SeverityBadge } from "@/components/SeverityBadge";
import { Button, Overlay } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/format";
import { CATALOG_GROUPS, STACK_CATALOG } from "@/lib/stack-catalog";
import type { Company, StackComponent, ThreatSummary } from "@/lib/types";

/**
 * Tech-stack drawer. Every toggle is saved immediately (debounced); the backend
 * re-scores all analysed threats against the new stack without calling the AI,
 * so the "Top threats for this stack" list re-ranks live.
 */
export function StackConfigurator({
  open,
  onClose,
  company,
  threats,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  company: Company | null;
  threats: ThreatSummary[];
  onSaved: (company: Company) => void;
}) {
  const toast = useToast();
  const [stack, setStack] = useState<StackComponent[]>(company?.tech_stack ?? []);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setStack(company?.tech_stack ?? []);
  }, [company]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const enabled = useMemo(() => new Set(stack.map((s) => s.key)), [stack]);
  const custom = stack.filter((s) => !STACK_CATALOG.some((c) => c.key === s.key));

  const persist = (next: StackComponent[]) => {
    if (!company) return;
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const saved = await api.updateStack(company.id, next);
        dirty.current = false;
        onSaved(saved);
      } catch (err) {
        toast("error", "Could not save tech stack", err instanceof ApiError ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    }, 350);
  };

  const toggle = (item: StackComponent) => {
    const next = enabled.has(item.key) ? stack.filter((s) => s.key !== item.key) : [...stack, { key: item.key, label: item.label, version: item.version }];
    setStack(next);
    persist(next);
  };

  const top = threats.filter((t) => t.priority_score != null && t.status !== "dismissed").slice(0, 6);

  return (
    <Overlay open={open} onClose={onClose} side="right" title={<span className="flex items-center gap-2"><Layers className="h-4 w-4 text-cyan-300" /> Company Tech Stack · {company?.name ?? ""}</span>}>
      <div className="space-y-5 p-4">
        <p className="text-xs text-slate-400">
          Toggle what you run. AegisPulse re-scores every analysed threat against your stack instantly: direct exposure raises priority (+1.5), no exposure lowers it (−3.0).
        </p>
        {CATALOG_GROUPS.map((group) => (
          <div key={group}>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{group}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {STACK_CATALOG.filter((c) => c.group === group).map((item) => {
                const on = enabled.has(item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggle(item)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition",
                      on ? "border-cyan-500/50 bg-cyan-500/[0.08] text-slate-100" : "border-ink-700 bg-ink-850 text-slate-400 hover:border-ink-500",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{item.label}</span>
                      <span className="block font-mono text-[10px] text-slate-500">{item.key}</span>
                    </span>
                    <span className={cn("relative h-4 w-7 shrink-0 rounded-full transition", on ? "bg-cyan-500" : "bg-ink-600")}>
                      <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", on ? "left-3.5" : "left-0.5")} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {custom.length ? (
          <p className="text-[11px] text-slate-500">Also configured via API: {custom.map((c) => c.label).join(", ")}</p>
        ) : null}

        <div className="rounded-lg border border-ink-700 bg-ink-850 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Top threats for this stack</p>
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              {saving ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-emerald-400" />}
              {saving ? "re-ranking…" : "live"}
            </span>
          </div>
          {top.length === 0 ? (
            <p className="text-xs text-slate-500">Analysed threats will be ranked here.</p>
          ) : (
            <ol className="space-y-1.5">
              {top.map((t, i) => (
                <li key={t.id} className="flex items-center gap-2 text-xs">
                  <span className="w-4 font-mono text-slate-500">{i + 1}</span>
                  <SeverityBadge score={t.priority_score} />
                  <span className="min-w-0 flex-1 truncate text-slate-200">{t.title}</span>
                  <span className={cn("shrink-0 text-[10px] uppercase", t.live_exposure === "direct" ? "text-red-300" : t.live_exposure === "indirect" ? "text-amber-200" : "text-slate-500")}>
                    {t.live_exposure}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <Button variant="primary" className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </Overlay>
  );
}

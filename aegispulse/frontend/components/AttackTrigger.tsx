"use client";

import { ChevronDown, Skull } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SourceTag } from "@/components/SeverityBadge";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import type { Scenario } from "@/lib/types";

export function AttackTrigger({ onTriggered, disabled = false }: { onTriggered: (threatId: string) => void; disabled?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.scenarios().then(setScenarios).catch(() => setScenarios([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const trigger = async (scenarioId?: string) => {
    setOpen(false);
    setBusy(true);
    try {
      const res = await api.simulateAttack(scenarioId);
      toast("info", "Live attack injected", `${res.scenario.name} - agents engaged`);
      onTriggered(res.threat_id);
    } catch (err) {
      toast("error", "Simulation failed", err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex" ref={menuRef}>
      <Button variant="danger" loading={busy} disabled={disabled} title={disabled ? "Requires the analyst role" : undefined} onClick={() => void trigger()} className="rounded-r-none">
        {!busy ? <Skull className="h-4 w-4" aria-hidden /> : null}
        <span className="hidden sm:inline">Trigger Live Dark Web Attack</span>
        <span className="sm:hidden">Attack</span>
      </Button>
      <Button
        variant="danger"
        className="rounded-l-none border-l border-red-800 px-2"
        aria-label="Choose attack scenario"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={busy || disabled}
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
      {open ? (
        <div className="absolute right-0 top-11 z-40 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-ink-600 bg-ink-850 shadow-2xl">
          <p className="border-b border-ink-700 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Choose scenario</p>
          {scenarios.length === 0 ? <p className="px-3 py-3 text-xs text-slate-500">Scenarios unavailable.</p> : null}
          {scenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void trigger(s.id)}
              className="block w-full border-b border-ink-800 px-3 py-2.5 text-left last:border-b-0 hover:bg-white/5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-100">{s.name}</span>
                <SourceTag source={s.source} />
              </div>
              <p className="mt-0.5 text-xs text-slate-400">{s.headline}</p>
              <p className="mt-1 font-mono text-[10px] text-slate-500">targets: {s.targets.join(", ")}</p>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

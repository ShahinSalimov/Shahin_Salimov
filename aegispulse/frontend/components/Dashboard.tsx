"use client";

import { Layers, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AttackTrigger } from "@/components/AttackTrigger";
import { StackConfigurator } from "@/components/StackConfigurator";
import { TelemetryBar } from "@/components/TelemetryBar";
import { ThreatFeed } from "@/components/ThreatFeed";
import { ThreatInspector } from "@/components/ThreatInspector";
import { Button, ErrorBoundary } from "@/components/ui/primitives";
import { useLiveData } from "@/hooks/useLiveData";

export function Dashboard() {
  const { company, threats, telemetry, loading, error, connection, version, refresh, replaceCompany } = useLiveData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stackOpen, setStackOpen] = useState(false);

  // Deep link from alert messages: /?threat=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("threat");
    if (id) setSelectedId(id);
  }, []);

  // Auto-select the top threat once data arrives.
  useEffect(() => {
    if (!selectedId && threats.length > 0) setSelectedId(threats[0]?.id ?? null);
  }, [threats, selectedId]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("threat", id);
    window.history.replaceState(null, "", url);
  }, []);

  return (
    <div className="flex min-h-screen flex-col gap-3 p-3 lg:h-screen lg:p-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-400/30 to-red-500/30 ring-1 ring-cyan-400/40">
            <ShieldAlert className="h-5 w-5 text-cyan-200" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-50">
              AegisPulse <span className="font-normal text-slate-500">SOC Command Center</span>
            </h1>
            <p className="text-[11px] text-slate-500">
              Autonomous AI & dark-web threat intelligence {company ? `· protecting ${company.name}` : ""}
            </p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button onClick={() => setStackOpen(true)} disabled={!company}>
            <Layers className="h-4 w-4" />
            Tech Stack <span className="rounded bg-ink-700 px-1 font-mono text-[10px]">{company?.tech_stack.length ?? 0}</span>
          </Button>
          <AttackTrigger
            onTriggered={(id) => {
              select(id);
              void refresh();
            }}
          />
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
          {error}
          <button type="button" className="ml-3 underline" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : null}

      <ErrorBoundary label="Telemetry">
        <TelemetryBar telemetry={telemetry} connection={connection} />
      </ErrorBoundary>

      <main className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(340px,5fr)_7fr]">
        <div className="min-h-[420px] min-w-0 lg:min-h-0">
          <ErrorBoundary label="Threat feed">
            <ThreatFeed threats={threats} loading={loading} selectedId={selectedId} onSelect={select} />
          </ErrorBoundary>
        </div>
        <div className="min-h-[600px] min-w-0 lg:min-h-0">
          <ErrorBoundary label="Threat inspector">
            <ThreatInspector threatId={selectedId} version={version} company={company} onChanged={() => void refresh()} />
          </ErrorBoundary>
        </div>
      </main>

      <StackConfigurator open={stackOpen} onClose={() => setStackOpen(false)} company={company} threats={threats} onSaved={replaceCompany} />
    </div>
  );
}

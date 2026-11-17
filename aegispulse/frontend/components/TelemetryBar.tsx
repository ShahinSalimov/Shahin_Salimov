"use client";

import { Activity, Bell, Cpu, Database, Gauge, ShieldCheck, Siren, Timer } from "lucide-react";
import type { ReactNode } from "react";

import type { Connection } from "@/hooks/useLiveData";
import { cn, formatDuration } from "@/lib/format";
import type { Telemetry } from "@/lib/types";

function Tile({ icon, label, value, sub, tone = "default" }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: "default" | "good" | "bad" | "warn" }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-ink-700 bg-ink-900/70 px-3 py-2">
      <div
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-md ring-1",
          tone === "good" && "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
          tone === "bad" && "bg-red-500/10 text-red-300 ring-red-500/30",
          tone === "warn" && "bg-amber-500/10 text-amber-200 ring-amber-500/30",
          tone === "default" && "bg-cyan-500/10 text-cyan-300 ring-cyan-500/30",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <p className="truncate font-mono text-lg font-semibold leading-tight text-slate-100 tabular-nums">{value}</p>
        {sub ? <p className="truncate text-[10px] text-slate-500">{sub}</p> : null}
      </div>
    </div>
  );
}

export function TelemetryBar({ telemetry, connection }: { telemetry: Telemetry | null; connection: Connection }) {
  const t = telemetry;
  const operational = t?.status === "operational";
  const connectionLabel = { connecting: "connecting", live: "live stream", polling: "polling", offline: "offline" }[connection];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      <Tile
        icon={<Activity className="h-4 w-4" />}
        label="System"
        tone={!t ? "default" : operational ? "good" : "warn"}
        value={!t ? "…" : operational ? "Operational" : "Degraded"}
        sub={
          <span className="inline-flex items-center gap-1">
            <span className={cn("h-1.5 w-1.5 rounded-full", connection === "live" ? "animate-pulse bg-emerald-400" : connection === "offline" ? "bg-red-400" : "bg-amber-400")} />
            {connectionLabel}
            {t && !t.ai_engine_configured ? " · AI key missing" : ""}
          </span>
        }
      />
      <Tile
        icon={<Cpu className="h-4 w-4" />}
        label="AI Agents Active"
        tone={t && t.agents_active > 0 ? "warn" : "default"}
        value={t ? `${t.agents_active}/${t.agents_total}` : "…"}
        sub={
          <span className="inline-flex items-center gap-1">
            {Array.from({ length: t?.agents_total ?? 3 }).map((_, i) => (
              <span key={i} className={cn("h-1.5 w-3 rounded-sm", t && i < t.agents_active ? "animate-pulse bg-amber-300" : "bg-ink-600")} />
            ))}
            <span className="ml-1">{t?.analyzing_now ?? 0} running</span>
          </span>
        }
      />
      <Tile icon={<Timer className="h-4 w-4" />} label="MTTR (AI plan)" value={formatDuration(t?.mttr_seconds)} sub="ingest → remediation" />
      <Tile icon={<Gauge className="h-4 w-4" />} label="Threats Analysed" value={t?.total_threats ?? "…"} sub="all sources" />
      <Tile icon={<Siren className="h-4 w-4" />} label="Critical" tone={t && t.critical_threats > 0 ? "bad" : "default"} value={t?.critical_threats ?? "…"} sub="severity ≥ 9.0" />
      <Tile icon={<ShieldCheck className="h-4 w-4" />} label="Threats Mitigated" tone="good" value={t?.threats_mitigated ?? "…"} sub="patch approved" />
      <Tile icon={<Bell className="h-4 w-4" />} label="Alerts Sent" value={t?.alerts_sent ?? "…"} sub="Slack · WhatsApp · Webhook" />
      <Tile icon={<Database className="h-4 w-4" />} label="Queue" value={t ? t.queue_depth : "…"} sub={t ? `${t.queue_backend} · ${t.model}` : ""} />
    </div>
  );
}

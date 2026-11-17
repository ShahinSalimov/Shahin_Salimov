"use client";

import { Radar, Radio, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { ExposureTag, SeverityBadge, SourceTag } from "@/components/SeverityBadge";
import { EmptyState, Panel, Spinner } from "@/components/ui/primitives";
import { cn, SEVERITY_STYLES, severityLabel, STAGES, stageIndex, timeAgo, truncateMiddle } from "@/lib/format";
import type { ThreatSummary } from "@/lib/types";

type Filter = "all" | "critical" | "active" | "exposed";

function InFlight({ threat }: { threat: ThreatSummary }) {
  const idx = stageIndex(threat.current_stage);
  const stage = STAGES[Math.max(0, Math.min(idx, STAGES.length - 1))];
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-amber-200">
          {threat.status === "queued" ? "Queued for analysis" : idx >= 3 ? "Validating output" : `${stage?.label}: ${stage?.name}`}
        </span>
        <span className="font-mono text-slate-500">{Math.max(0, Math.min(idx, 3))}/3</span>
      </div>
      <div className="relative mt-1 h-1 overflow-hidden rounded bg-ink-700">
        <div className="absolute inset-y-0 left-0 rounded bg-amber-400/70 transition-all duration-700" style={{ width: `${(Math.max(0, idx) / 3) * 100}%` }} />
        <div className="absolute inset-y-0 w-1/3 animate-scan bg-gradient-to-r from-transparent via-amber-200/60 to-transparent" />
      </div>
    </div>
  );
}

function FeedItem({ threat, selected, onSelect }: { threat: ThreatSummary; selected: boolean; onSelect: () => void }) {
  const inFlight = threat.status === "queued" || threat.status === "analyzing";
  const score = threat.priority_score ?? threat.final_severity;
  const label = severityLabel(score);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "group relative block w-full border-b border-ink-800 py-2.5 pl-4 pr-3 text-left transition-colors",
          selected ? "bg-cyan-500/[0.07]" : "hover:bg-white/[0.03]",
          inFlight && "animate-flash",
        )}
      >
        <span className={cn("absolute inset-y-0 left-0 w-1", inFlight ? "animate-pulse bg-amber-400" : SEVERITY_STYLES[label].bar, selected && "w-1.5")} />
        <div className="flex items-center gap-1.5">
          {inFlight ? <SeverityBadge score={null} className="!bg-amber-400/10 !text-amber-200 !ring-amber-400/40" /> : <SeverityBadge score={score} />}
          <SourceTag source={threat.source} />
          {threat.injection_signals.length ? (
            <span title="Prompt-injection attempt detected in source" className="text-fuchsia-300">
              <TriangleAlert className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">{timeAgo(threat.ingested_at)}</span>
        </div>
        <p className={cn("mt-1.5 line-clamp-2 text-[13px] font-medium leading-snug", inFlight ? "text-slate-300" : "text-slate-100")}>
          {threat.title ?? (threat.status === "failed" ? "Analysis failed" : threat.source_ref ?? "Incoming intelligence…")}
        </p>
        {inFlight ? <InFlight threat={threat} /> : null}
        {threat.status === "failed" && threat.error ? <p className="mt-1 line-clamp-2 text-[11px] text-red-300/80">{threat.error}</p> : null}
        {!inFlight && threat.indicators.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {threat.indicators.slice(0, 4).map((i) => (
              <span key={`${i.type}:${i.value}`} className="max-w-full truncate rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300 ring-1 ring-ink-700">
                <span className="text-slate-500">{i.type}</span> {truncateMiddle(i.value, 26)}
              </span>
            ))}
            {threat.indicators.length > 4 ? <span className="px-1 py-0.5 text-[10px] text-slate-500">+{threat.indicators.length - 4}</span> : null}
          </div>
        ) : null}
        {!inFlight && threat.final_severity != null ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ExposureTag exposure={threat.live_exposure ?? threat.exposure} />
            {threat.matched_components.length ? <span className="font-mono text-[10px] text-slate-400">stack: {threat.matched_components.join(", ")}</span> : null}
            {threat.status === "mitigated" ? <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">mitigated</span> : null}
            {threat.status === "dismissed" ? <span className="text-[10px] uppercase tracking-wider text-slate-500">dismissed</span> : null}
            {threat.mitre_techniques.length ? <span className="ml-auto font-mono text-[10px] text-slate-500">{threat.mitre_techniques.length} TTPs</span> : null}
          </div>
        ) : null}
      </button>
    </li>
  );
}

export function ThreatFeed({
  threats,
  loading,
  selectedId,
  onSelect,
}: {
  threats: ThreatSummary[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = useMemo(() => {
    switch (filter) {
      case "critical":
        return threats.filter((t) => (t.priority_score ?? 0) >= 9);
      case "active":
        return threats.filter((t) => ["queued", "analyzing", "analyzed", "failed"].includes(t.status));
      case "exposed":
        return threats.filter((t) => t.live_exposure === "direct");
      default:
        return threats;
    }
  }, [threats, filter]);

  return (
    <Panel
      title="Live Threat Intelligence Feed"
      icon={<Radio className="h-3.5 w-3.5 text-red-400" />}
      className="h-full"
      bodyClassName="flex flex-col"
      actions={
        <div className="flex gap-0.5 rounded-md bg-ink-800 p-0.5">
          {(["all", "critical", "exposed", "active"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn("rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", filter === f ? "bg-ink-600 text-slate-100" : "text-slate-500 hover:text-slate-300")}
            >
              {f}
            </button>
          ))}
        </div>
      }
    >
      {loading && threats.length === 0 ? (
        <Spinner label="Connecting to intelligence feed…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Radar className="h-10 w-10" />}
          title={threats.length === 0 ? "No threats ingested yet" : "Nothing matches this filter"}
          hint={threats.length === 0 ? 'Click "Trigger Live Dark Web Attack" to run the three AI agents on a realistic threat.' : undefined}
        />
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {visible.map((t) => (
            <FeedItem key={t.id} threat={t} selected={t.id === selectedId} onSelect={() => onSelect(t.id)} />
          ))}
        </ul>
      )}
      <p className="border-t border-ink-800 px-3 py-1.5 text-[10px] text-slate-500">Ranked by stack-aware priority · {threats.length} items</p>
    </Panel>
  );
}

"use client";

import {
  Ban,
  Bell,
  Check,
  Copy,
  Crosshair,
  FileJson,
  FileText,
  Fingerprint,
  Layers,
  LoaderCircle,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";

import { DispatchDialog } from "@/components/DispatchDialog";
import { MitreMatrix } from "@/components/MitreMatrix";
import { RemediationTerminal } from "@/components/RemediationTerminal";
import { ExposureTag, SeverityBadge, SourceTag } from "@/components/SeverityBadge";
import { Badge, Button, EmptyState, Panel, Spinner, Tabs } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useThreatDetail } from "@/hooks/useLiveData";
import { api, ApiError, copyText, downloadExport } from "@/lib/api";
import { cn, STAGES, stageIndex, timeAgo } from "@/lib/format";
import type { Company, ThreatDetail } from "@/lib/types";

type Tab = "overview" | "mitre" | "stack" | "remediation" | "alerts" | "raw";

function PipelineProgress({ detail }: { detail: ThreatDetail }) {
  const running = detail.status === "queued" || detail.status === "analyzing";
  const idx = running ? stageIndex(detail.current_stage) : detail.analysis ? 3 : -1;
  const metrics = new Map((detail.analysis?.stages ?? []).map((s) => [s.stage, s]));
  return (
    <div className="grid grid-cols-3 gap-2">
      {STAGES.map((s, i) => {
        const done = idx > i || (!running && detail.analysis && !(detail.analysis.short_circuited && i > 0));
        const active = running && idx === i;
        const skipped = !running && detail.analysis?.short_circuited && i > 0;
        const m = metrics.get(s.key as never);
        return (
          <div
            key={s.key}
            className={cn(
              "relative overflow-hidden rounded-md border px-2.5 py-2",
              active && "border-amber-400/60 bg-amber-400/[0.06]",
              done && "border-emerald-500/40 bg-emerald-500/[0.05]",
              !active && !done && "border-ink-700 bg-ink-850",
            )}
          >
            {active ? <div className="absolute inset-y-0 w-1/3 animate-scan bg-gradient-to-r from-transparent via-amber-300/10 to-transparent" /> : null}
            <div className="flex items-center gap-1.5">
              {active ? <LoaderCircle className="h-3.5 w-3.5 animate-spin text-amber-300" /> : done ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <span className="h-3.5 w-3.5 rounded-full border border-ink-500" />}
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</span>
            </div>
            <p className="mt-0.5 text-xs font-medium text-slate-200">{s.name}</p>
            <p className="font-mono text-[10px] text-slate-500">
              {skipped ? "skipped (noise)" : m ? `${(m.duration_ms / 1000).toFixed(1)}s · ${m.input_tokens + m.output_tokens} tok${m.tool_calls ? ` · ${m.tool_calls} tools` : ""}` : active ? "running…" : "waiting"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Overview({ detail }: { detail: ThreatDetail }) {
  const toast = useToast();
  const triage = detail.analysis?.triage;
  const [copiedIoc, setCopiedIoc] = useState<string | null>(null);
  const copy = async (value: string) => {
    try {
      await copyText(value);
      setCopiedIoc(value);
      setTimeout(() => setCopiedIoc(null), 1200);
    } catch {
      toast("error", "Copy failed");
    }
  };
  if (!triage) return <EmptyState icon={<ScanLine className="h-10 w-10" />} title="Triage pending" hint="Agent 1 output appears here once analysis completes." />;
  const injection = detail.injection_signals.length > 0;

  return (
    <div className="space-y-4">
      {injection ? (
        <div className="flex gap-3 rounded-md border border-fuchsia-500/40 bg-fuchsia-500/[0.06] p-3">
          <TriangleAlert className="h-5 w-5 shrink-0 text-fuchsia-300" />
          <div>
            <p className="text-sm font-medium text-fuchsia-200">Prompt-injection attempt detected and neutralised</p>
            <p className="mt-0.5 text-xs text-fuchsia-100/70">
              The source text tried to manipulate AI analysts ({detail.injection_signals.join(", ")}). It was treated as evidence only; the
              analysis is flagged for human review.
            </p>
          </div>
        </div>
      ) : null}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300">Agent 1 · Triage summary</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-200">{triage.summary}</p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {[
          ["Category", triage.threat_category.replace(/_/g, " ")],
          ["Base CVSS", triage.severity_score.toFixed(1)],
          ["Actor", detail.threat_actor ?? "Unattributed"],
          ["Priority", detail.analysis?.context?.recommended_priority ?? "n/a"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border border-ink-700 bg-ink-850 px-2.5 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-slate-500">{k}</dt>
            <dd className="mt-0.5 truncate font-medium capitalize text-slate-100">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-md border border-ink-700 bg-ink-850 p-3">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">Severity rationale</p>
        <p className="mt-1 text-xs text-slate-300">{triage.severity_rationale}</p>
        {triage.cvss_vector ? <p className="mt-1.5 font-mono text-[11px] text-slate-400">{triage.cvss_vector}</p> : null}
      </div>
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <Fingerprint className="h-3.5 w-3.5 text-cyan-300" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Indicators of compromise ({detail.indicators.length} grounded)</p>
        </div>
        <div className="overflow-hidden rounded-md border border-ink-700">
          <table className="w-full text-left text-xs">
            <thead className="bg-ink-850 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-2.5 py-1.5">Type</th>
                <th className="px-2.5 py-1.5">Value</th>
                <th className="hidden px-2.5 py-1.5 md:table-cell">Context</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {detail.indicators.map((i) => (
                <tr key={`${i.type}:${i.value}`} className="border-t border-ink-800">
                  <td className="px-2.5 py-1.5 font-mono text-[11px] text-cyan-300">{i.type}</td>
                  <td className="max-w-[260px] break-all px-2.5 py-1.5 font-mono text-[11px] text-slate-200">{i.value}</td>
                  <td className="hidden px-2.5 py-1.5 text-slate-400 md:table-cell">{i.context}</td>
                  <td className="px-2">
                    <button type="button" onClick={() => void copy(i.value)} className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-slate-200" aria-label={`Copy ${i.value}`}>
                      {copiedIoc === i.value ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {detail.analysis?.dropped_indicators.length ? (
          <p className="mt-1.5 text-[11px] text-slate-500">
            {detail.analysis.dropped_indicators.length} model-proposed indicator(s) discarded because they do not appear in the source (
            {detail.analysis.dropped_indicators.map((d) => d.value).join(", ")}).
          </p>
        ) : null}
      </div>
      {detail.analysis?.context ? (
        <div className="rounded-md border border-ink-700 bg-ink-850 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300">Agent 2 · Attack narrative</p>
          <p className="mt-1 text-sm text-slate-300">{detail.analysis.context.attack_narrative}</p>
          {detail.analysis.context.likely_targets.length ? (
            <p className="mt-2 text-xs text-slate-500">Likely targets: {detail.analysis.context.likely_targets.join(", ")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StackImpactView({ detail, company }: { detail: ThreatDetail; company: Company | null }) {
  const impacts = detail.analysis?.context?.stack_impacts ?? [];
  const impacted = new Set(detail.matched_components);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        Live exposure against current stack: <ExposureTag exposure={detail.live_exposure} />
        {detail.priority_score != null ? (
          <span>
            → priority <span className="font-mono text-slate-100">{detail.priority_score.toFixed(1)}</span>
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {(company?.tech_stack ?? []).map((c) => {
          const hit = impacted.has(c.key);
          const impact = impacts.find((i) => i.component_key === c.key);
          return (
            <div
              key={c.key}
              className={cn(
                "rounded-md border px-3 py-2",
                hit || impact?.exposure === "direct" ? "border-red-500/50 bg-red-500/[0.07]" : impact?.exposure === "indirect" ? "border-amber-400/40 bg-amber-400/[0.05]" : "border-ink-700 bg-ink-850",
              )}
            >
              <p className="text-sm font-medium text-slate-100">{c.label}</p>
              <p className="font-mono text-[10px] text-slate-500">{c.key}</p>
              <p className={cn("mt-1 text-[10px] font-semibold uppercase tracking-wider", hit ? "text-red-300" : impact ? "text-amber-200" : "text-slate-600")}>
                {hit ? "impacted" : impact ? impact.exposure : "not targeted"}
              </p>
            </div>
          );
        })}
      </div>
      {impacts.length ? (
        <ul className="space-y-1.5">
          {impacts.map((i) => (
            <li key={i.component_key} className="rounded-md border border-ink-700 bg-ink-850 px-3 py-2 text-xs">
              <span className="font-medium text-slate-100">{i.component_label}</span>
              <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-500">{i.exposure}</span>
              <p className="mt-0.5 text-slate-400">{i.reasoning}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-[11px] text-slate-500">
        Targets named by the threat: {detail.affected_technologies.length ? detail.affected_technologies.join(", ") : "none identified"}
      </p>
    </div>
  );
}

function AlertsView({ detail, onDispatch }: { detail: ThreatDetail; onDispatch: () => void }) {
  return (
    <div className="space-y-3">
      <Button variant="primary" onClick={onDispatch} disabled={!detail.analysis}>
        <Bell className="h-4 w-4" /> Dispatch Alert (WhatsApp/Slack)
      </Button>
      {detail.alerts.length === 0 ? (
        <p className="text-xs text-slate-500">No alerts sent for this threat yet. Severity ≥ 8.0 triggers automatic dispatch on configured channels.</p>
      ) : (
        <ul className="space-y-1.5">
          {detail.alerts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-ink-700 bg-ink-850 px-3 py-2 text-xs">
              <Badge className={a.status === "sent" ? "text-emerald-300 bg-emerald-500/10 ring-emerald-500/30" : a.status === "failed" ? "text-red-300 bg-red-500/10 ring-red-500/30" : "text-slate-400 bg-slate-500/10 ring-slate-500/30"}>{a.status}</Badge>
              <span className="font-medium capitalize text-slate-200">{a.channel}</span>
              {a.destination ? <span className="font-mono text-slate-500">{a.destination}</span> : null}
              <span className="text-slate-500">· {a.trigger}</span>
              <span className="ml-auto text-slate-500">{timeAgo(a.created_at)}</span>
              {a.error ? <p className="w-full text-[11px] text-slate-500">{a.error}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ThreatInspector({ threatId, version, company, onChanged }: { threatId: string | null; version: number; company: Company | null; onChanged: () => void }) {
  const toast = useToast();
  const { detail, loading, error, reload } = useThreatDetail(threatId, version);
  const [tab, setTab] = useState<Tab>("overview");
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setTab("overview"), [threatId]);

  if (!threatId) {
    return (
      <Panel title="Threat Deep-Dive & MITRE ATT&CK Inspector" icon={<Crosshair className="h-3.5 w-3.5 text-cyan-300" />} className="h-full">
        <EmptyState icon={<Crosshair className="h-12 w-12" />} title="Select a threat" hint="Pick an item from the live feed to inspect the three agents' output." />
      </Panel>
    );
  }

  const refreshAll = () => {
    reload();
    onChanged();
  };

  const act = async (name: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(name);
    try {
      await fn();
      toast("success", success);
      refreshAll();
    } catch (err) {
      toast("error", `${name} failed`, err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const running = detail && (detail.status === "queued" || detail.status === "analyzing");
  const score = detail?.priority_score ?? detail?.final_severity ?? null;

  return (
    <Panel title="Threat Deep-Dive & MITRE ATT&CK Inspector" icon={<Crosshair className="h-3.5 w-3.5 text-cyan-300" />} className="h-full" bodyClassName="flex flex-col">
      {error && !detail ? <p className="m-4 rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">{error}</p> : null}
      {loading && !detail ? <Spinner label="Loading threat…" /> : null}
      {detail ? (
        <>
          <div className="space-y-3 border-b border-ink-700 p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {running ? <Badge className="text-amber-200 bg-amber-400/10 ring-amber-400/40">analysing</Badge> : <SeverityBadge score={score} />}
              <SourceTag source={detail.source} />
              <ExposureTag exposure={detail.live_exposure ?? detail.exposure} />
              {detail.requires_human_review ? <Badge className="text-fuchsia-200 bg-fuchsia-500/10 ring-fuchsia-500/30">human review</Badge> : null}
              <Badge className="text-slate-300 bg-slate-500/10 ring-slate-500/30">{detail.status}</Badge>
              <span className="ml-auto font-mono text-[10px] text-slate-500">{timeAgo(detail.ingested_at)} · {detail.source_ref ?? "manual"}</span>
            </div>
            <h3 className="text-lg font-semibold leading-snug text-slate-50">{detail.title ?? "Analysis in progress…"}</h3>
            <PipelineProgress detail={detail} />
            {detail.status === "failed" ? (
              <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 p-2.5 text-xs text-red-200">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span className="break-words">{detail.error}</span>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!detail.analysis} loading={busy === "stix"} onClick={() => void act("stix", () => downloadExport(detail.id, "stix"), "STIX 2.1 bundle downloaded")}>
                <FileJson className="h-3.5 w-3.5" /> Download STIX 2.1
              </Button>
              <Button size="sm" disabled={!detail.analysis} loading={busy === "cef"} onClick={() => void act("cef", () => downloadExport(detail.id, "cef"), "CEF events downloaded")}>
                <FileText className="h-3.5 w-3.5" /> Download CEF
              </Button>
              <Button size="sm" disabled={!!running} loading={busy === "reanalyze"} onClick={() => void act("reanalyze", () => api.reanalyze(detail.id), "Re-analysis queued")}>
                <RefreshCw className="h-3.5 w-3.5" /> Re-run AI agents
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!!running || detail.status === "dismissed"}
                loading={busy === "dismiss"}
                onClick={() => void act("dismiss", () => api.dismiss(detail.id), "Threat dismissed")}
              >
                <Ban className="h-3.5 w-3.5" /> Dismiss
              </Button>
            </div>
          </div>
          <Tabs<Tab>
            active={tab}
            onChange={setTab}
            tabs={[
              { key: "overview", label: "Triage" },
              { key: "mitre", label: "MITRE ATT&CK", count: detail.mitre_techniques.length },
              { key: "stack", label: "Stack Impact", count: detail.matched_components.length },
              { key: "remediation", label: "Remediation", count: detail.patches.length },
              { key: "alerts", label: "Alerts", count: detail.alerts.length },
              { key: "raw", label: "Raw Intel" },
            ]}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "overview" ? <Overview detail={detail} /> : null}
            {tab === "mitre" ? (
              detail.mitre_techniques.length ? (
                <MitreMatrix mappings={detail.mitre_techniques} />
              ) : (
                <EmptyState icon={<Layers className="h-10 w-10" />} title="No ATT&CK mapping yet" hint="Agent 2 maps techniques after triage." />
              )
            ) : null}
            {tab === "stack" ? <StackImpactView detail={detail} company={company} /> : null}
            {tab === "remediation" ? (
              <RemediationTerminal patches={detail.patches} plan={detail.analysis?.remediation ?? null} onChanged={refreshAll} onDispatch={() => setDispatchOpen(true)} />
            ) : null}
            {tab === "alerts" ? <AlertsView detail={detail} onDispatch={() => setDispatchOpen(true)} /> : null}
            {tab === "raw" ? (
              <pre className="whitespace-pre-wrap break-words rounded-md border border-ink-700 bg-black/40 p-3 font-mono text-[11.5px] leading-relaxed text-slate-300">{detail.raw_text}</pre>
            ) : null}
          </div>
          {detail.analysis ? (
            <DispatchDialog threatId={detail.id} open={dispatchOpen} onClose={() => setDispatchOpen(false)} onSent={refreshAll} />
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}

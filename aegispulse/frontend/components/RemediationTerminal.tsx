"use client";

import { Ban, Check, CircleCheck, Copy, Play, Send, ShieldCheck, Terminal, TriangleAlert, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, copyText } from "@/lib/api";
import { cn } from "@/lib/format";
import { detectLanguage, highlight } from "@/lib/highlight";
import type { Patch, PatchSimulation, RemediationPlan } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  bash: "bash",
  python: "python",
  iptables: "iptables",
  nftables: "nftables",
  ufw: "ufw",
  aws_waf: "AWS WAF",
  aws_security_group: "AWS SG",
  nginx: "nginx",
  detection: "detection",
};

const RISK_STYLE = {
  low: "text-emerald-300 bg-emerald-500/10 ring-emerald-500/30",
  medium: "text-amber-200 bg-amber-500/10 ring-amber-500/30",
  high: "text-red-300 bg-red-500/10 ring-red-500/30",
};

function Code({ content, kind }: { content: string; kind: string }) {
  const lines = useMemo(() => highlight(content, detectLanguage(kind, content)), [content, kind]);
  return (
    <pre className="overflow-x-auto font-mono text-[12px] leading-[1.55]">
      <code>
        {lines.map((tokens, i) => (
          <div key={i} className="flex">
            <span className="w-9 shrink-0 select-none pr-3 text-right text-slate-600">{i + 1}</span>
            <span className="whitespace-pre">
              {tokens.length ? tokens.map((t, j) => (
                <span key={j} className={t.cls}>
                  {t.text}
                </span>
              )) : " "}
            </span>
          </div>
        ))}
      </code>
    </pre>
  );
}

export function RemediationTerminal({
  patches,
  plan,
  onChanged,
  onDispatch,
}: {
  patches: Patch[];
  plan: RemediationPlan | null;
  onChanged: () => void;
  onDispatch: () => void;
}) {
  const toast = useToast();
  const [activeId, setActiveId] = useState<string | null>(patches[0]?.id ?? null);
  const [showRollback, setShowRollback] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"simulate" | "approve" | "reject" | null>(null);
  const [simulation, setSimulation] = useState<PatchSimulation | null>(null);

  useEffect(() => {
    if (!patches.some((p) => p.id === activeId)) setActiveId(patches[0]?.id ?? null);
  }, [patches, activeId]);
  useEffect(() => {
    setSimulation(null);
    setShowRollback(false);
  }, [activeId]);

  const patch = patches.find((p) => p.id === activeId) ?? null;
  if (!patch) {
    return (
      <EmptyState
        icon={<Terminal className="h-10 w-10" />}
        title="No remediation artefacts"
        hint="Agent 3 produces scripts and rules once the threat is analysed and judged actionable."
      />
    );
  }
  const content = showRollback && patch.rollback_content ? patch.rollback_content : patch.content;
  const v = patch.validation;

  const run = async (action: "simulate" | "approve" | "reject") => {
    setBusy(action);
    try {
      if (action === "simulate") {
        setSimulation(await api.simulatePatch(patch.id));
      } else if (action === "approve") {
        await api.approvePatch(patch.id);
        toast("success", "Patch approved", `${patch.title} marked approved; threat moved to mitigated.`);
        onChanged();
      } else {
        await api.rejectPatch(patch.id);
        toast("info", "Patch rejected", patch.title);
        onChanged();
      }
    } catch (err) {
      toast("error", `Could not ${action} patch`, err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await copyText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("error", "Copy failed", "Clipboard access was blocked by the browser.");
    }
  };

  return (
    <div className="space-y-3">
      {plan ? (
        <div className="rounded-md border border-cyan-500/20 bg-cyan-500/[0.04] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300">Agent 3 · Executive summary</p>
          <p className="mt-1 text-sm text-slate-200">{plan.executive_summary}</p>
          {plan.mitigation_steps.length ? (
            <ol className="mt-2 grid gap-1 sm:grid-cols-2">
              {plan.mitigation_steps.map((s) => (
                <li key={s.order} className="flex gap-2 text-xs text-slate-300">
                  <span className={cn("shrink-0 rounded px-1 font-mono text-[10px] uppercase", s.urgency === "immediate" ? "bg-red-500/15 text-red-300" : s.urgency === "24h" ? "bg-amber-500/15 text-amber-200" : "bg-ink-700 text-slate-400")}>
                    {s.urgency}
                  </span>
                  <span>
                    <span className="text-slate-500">{s.owner}:</span> {s.action}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1">
        {patches.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiveId(p.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ring-1 transition",
              p.id === activeId ? "bg-ink-700 text-slate-100 ring-cyan-500/50" : "bg-ink-850 text-slate-400 ring-ink-700 hover:text-slate-200",
            )}
          >
            <span className="font-mono text-[10px] uppercase text-cyan-300">{KIND_LABEL[p.kind] ?? p.kind}</span>
            <span className="max-w-[180px] truncate">{p.title}</span>
            {p.status === "approved" ? <CircleCheck className="h-3 w-3 text-emerald-400" /> : null}
            {p.status === "rejected" ? <Ban className="h-3 w-3 text-red-400" /> : null}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-ink-600 bg-[#05080c] shadow-inner">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 bg-ink-850 px-3 py-1.5">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
          </div>
          <span className="font-mono text-xs text-slate-400">
            {showRollback ? "rollback: " : ""}
            {patch.title}
          </span>
          {v ? (
            <>
              <Badge className={v.syntax_ok ? "text-emerald-300 bg-emerald-500/10 ring-emerald-500/30" : "text-red-300 bg-red-500/10 ring-red-500/30"}>
                {v.syntax_ok ? "syntax ok" : "syntax error"}
              </Badge>
              <Badge className={RISK_STYLE[v.risk_level]}>{v.risk_level} risk</Badge>
            </>
          ) : null}
          {patch.requires_root ? <Badge className="text-slate-300 bg-slate-500/10 ring-slate-500/30">root</Badge> : null}
          <Badge
            className={
              patch.status === "approved"
                ? "text-emerald-300 bg-emerald-500/10 ring-emerald-500/30"
                : patch.status === "rejected"
                  ? "text-red-300 bg-red-500/10 ring-red-500/30"
                  : "text-amber-200 bg-amber-500/10 ring-amber-500/30"
            }
          >
            {patch.status === "proposed" ? "pending approval" : patch.status}
          </Badge>
          <div className="ml-auto flex gap-1">
            {patch.rollback_content ? (
              <Button size="sm" variant="ghost" onClick={() => setShowRollback((s) => !s)}>
                <Undo2 className="h-3.5 w-3.5" />
                {showRollback ? "Show patch" : "Show rollback"}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => void copy()} aria-label="Copy to clipboard">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        <div className="max-h-[420px] overflow-auto p-3">
          <Code content={content} kind={patch.kind} />
        </div>
        {simulation ? (
          <div className="border-t border-ink-700 bg-black/40 p-3 font-mono text-[11.5px] leading-relaxed">
            {simulation.transcript.map((line, i) => (
              <div
                key={i}
                className={cn(
                  line.startsWith("[finding]") && "text-amber-200",
                  line.startsWith("[result]") && (simulation.syntax_ok ? "text-emerald-300" : "text-red-300"),
                  line.startsWith("$") && "text-cyan-300",
                  !/^(\[finding\]|\[result\]|\$)/.test(line) && "text-slate-400",
                )}
              >
                {line}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {v && v.findings.length ? (
        <ul className="space-y-1 rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-2.5">
          {v.findings.map((f) => (
            <li key={f} className="flex items-start gap-2 text-xs text-amber-100/90">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
              {f}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void copy()}>
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied to clipboard" : "One-Click Copy"}
        </Button>
        <Button onClick={() => void run("simulate")} loading={busy === "simulate"}>
          {busy !== "simulate" ? <Play className="h-4 w-4" /> : null}
          Simulate Execution
        </Button>
        <Button variant="success" onClick={() => void run("approve")} loading={busy === "approve"} disabled={patch.status !== "proposed"}>
          {busy !== "approve" ? <ShieldCheck className="h-4 w-4" /> : null}
          Approve
        </Button>
        <Button variant="ghost" onClick={() => void run("reject")} loading={busy === "reject"} disabled={patch.status !== "proposed"}>
          Reject
        </Button>
        <Button variant="primary" className="sm:ml-auto" onClick={onDispatch}>
          <Send className="h-4 w-4" />
          Dispatch Alert (WhatsApp/Slack)
        </Button>
      </div>
      <p className="text-[11px] text-slate-500">
        Scripts are never executed by AegisPulse. &quot;Simulate Execution&quot; runs static analysis (bash -n / AST parse / JSON schema) and shows the planned actions.
      </p>
    </div>
  );
}

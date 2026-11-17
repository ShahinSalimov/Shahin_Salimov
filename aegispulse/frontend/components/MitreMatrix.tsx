import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/format";
import type { MitreMapping } from "@/lib/types";

// Enterprise ATT&CK tactics in kill-chain order.
const TACTICS: Array<[string, string]> = [
  ["TA0043", "Reconnaissance"],
  ["TA0042", "Resource Development"],
  ["TA0001", "Initial Access"],
  ["TA0002", "Execution"],
  ["TA0003", "Persistence"],
  ["TA0004", "Privilege Escalation"],
  ["TA0005", "Defense Evasion"],
  ["TA0006", "Credential Access"],
  ["TA0007", "Discovery"],
  ["TA0008", "Lateral Movement"],
  ["TA0009", "Collection"],
  ["TA0011", "Command and Control"],
  ["TA0010", "Exfiltration"],
  ["TA0040", "Impact"],
];

const CONFIDENCE = { high: "bg-red-500/20 ring-red-400/50 text-red-100", medium: "bg-orange-500/15 ring-orange-400/40 text-orange-100", low: "bg-amber-400/10 ring-amber-300/30 text-amber-100" };

export function MitreMatrix({ mappings }: { mappings: MitreMapping[] }) {
  const byTactic = new Map<string, MitreMapping[]>();
  for (const m of mappings) byTactic.set(m.tactic_id, [...(byTactic.get(m.tactic_id) ?? []), m]);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[980px] gap-1" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
          {TACTICS.map(([id, name]) => {
            const hits = byTactic.get(id) ?? [];
            return (
              <div key={id} className="flex flex-col gap-1">
                <div className={cn("rounded px-1.5 py-1.5 text-center ring-1", hits.length ? "bg-cyan-500/10 ring-cyan-400/40" : "bg-ink-850 ring-ink-700")}>
                  <p className={cn("text-[9px] font-semibold uppercase leading-tight tracking-wide", hits.length ? "text-cyan-200" : "text-slate-500")}>{name}</p>
                  <p className="font-mono text-[9px] text-slate-600">{id}</p>
                </div>
                {hits.map((m) => (
                  <a
                    key={m.technique_id}
                    href={`https://attack.mitre.org/techniques/${m.technique_id.replace(".", "/")}/`}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={m.rationale}
                    className={cn("rounded px-1.5 py-1.5 ring-1 transition hover:brightness-125", CONFIDENCE[m.confidence])}
                  >
                    <p className="font-mono text-[10px] font-semibold">{m.technique_id}</p>
                    <p className="text-[10px] leading-tight">{m.technique_name}</p>
                  </a>
                ))}
                {hits.length === 0 ? <div className="h-10 rounded border border-dashed border-ink-700/60" /> : null}
              </div>
            );
          })}
        </div>
      </div>
      <ol className="space-y-2">
        {mappings.map((m, i) => (
          <li key={m.technique_id} className="flex gap-3 rounded-md border border-ink-700 bg-ink-850 p-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-700 font-mono text-[11px] text-slate-300">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-cyan-200">{m.technique_id}</span>
                <span className="text-sm text-slate-100">{m.technique_name}</span>
                <span className="text-[11px] text-slate-500">· {m.tactic}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-500">{m.confidence} confidence</span>
                <a
                  className="text-slate-500 hover:text-cyan-300"
                  href={`https://attack.mitre.org/techniques/${m.technique_id.replace(".", "/")}/`}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`Open ${m.technique_id} on attack.mitre.org`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <p className="mt-1 text-xs text-slate-400">{m.rationale}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

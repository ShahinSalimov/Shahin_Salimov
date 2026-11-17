"use client";

import { CircleCheck, CircleX, Play, Radar } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { SourceTag } from "@/components/SeverityBadge";
import { Badge, Button, Overlay, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { formatDuration, timeAgo } from "@/lib/format";
import type { CollectorStatus } from "@/lib/types";

const LABELS: Record<string, string> = {
  nvd: "NVD CVE feed",
  telegram: "Telegram OSINT channels",
  paste: "Paste sites (Pastebin scraping)",
  darkweb_feed: "Dark-web intelligence feed",
};

export function SourcesDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [collectors, setCollectors] = useState<CollectorStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .collectors()
      .then((c) => {
        setCollectors(c);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Failed to load collectors"));
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [open, load]);

  const run = async (name: string) => {
    setBusy(name);
    try {
      await api.runCollector(name);
      toast("info", "Collection requested", `${LABELS[name] ?? name} will run within a few seconds.`);
      load();
    } catch (err) {
      toast("error", "Could not start collector", err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Overlay
      open={open}
      onClose={onClose}
      side="right"
      title={
        <span className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-cyan-300" /> Intelligence sources
        </span>
      }
    >
      <div className="space-y-3 p-4">
        <p className="text-xs text-slate-400">
          Collectors run in the <span className="font-mono">collector</span> service. Enable them with <span className="font-mono">AEGIS_COLLECTORS</span>; &quot;Run now&quot; also works for disabled collectors.
        </p>
        {error ? <p className="rounded border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">{error}</p> : null}
        {!collectors && !error ? <Spinner label="Loading collectors…" /> : null}
        {collectors?.map((c) => (
          <div key={c.name} className="rounded-lg border border-ink-700 bg-ink-850 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-100">{LABELS[c.name] ?? c.name}</span>
              <SourceTag source={c.source} />
              <Badge className={c.enabled ? "text-emerald-300 bg-emerald-500/10 ring-emerald-500/30" : "text-slate-400 bg-slate-500/10 ring-slate-500/30"}>
                {c.enabled ? "enabled" : "disabled"}
              </Badge>
              {!c.configured ? <Badge className="text-amber-200 bg-amber-500/10 ring-amber-500/30">needs config</Badge> : null}
              <Button size="sm" className="ml-auto" loading={busy === c.name} disabled={c.run_requested} onClick={() => void run(c.name)}>
                {busy !== c.name ? <Play className="h-3.5 w-3.5" /> : null}
                {c.run_requested ? "Queued" : "Run now"}
              </Button>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-400 sm:grid-cols-4">
              <div>
                <dt className="text-slate-500">Interval</dt>
                <dd className="font-mono text-slate-300">{formatDuration(c.interval_seconds)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Last run</dt>
                <dd className="font-mono text-slate-300">{c.last_run_at ? timeAgo(c.last_run_at) : "never"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Last batch</dt>
                <dd className="font-mono text-slate-300">{c.last_items} new</dd>
              </div>
              <div>
                <dt className="text-slate-500">Total ingested</dt>
                <dd className="font-mono text-slate-300">{c.items_ingested_total}</dd>
              </div>
            </dl>
            {c.config_issue ? <p className="mt-2 text-[11px] text-amber-200/80">{c.config_issue}</p> : null}
            {c.last_run_at ? (
              <p className={`mt-2 flex items-start gap-1.5 text-[11px] ${c.last_error ? "text-red-300" : "text-emerald-300"}`}>
                {c.last_error ? <CircleX className="mt-0.5 h-3 w-3 shrink-0" /> : <CircleCheck className="mt-0.5 h-3 w-3 shrink-0" />}
                <span className="break-words">{c.last_error ?? "Last run succeeded"}</span>
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </Overlay>
  );
}

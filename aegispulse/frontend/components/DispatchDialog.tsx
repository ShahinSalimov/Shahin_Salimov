"use client";

import { Hash, MessageCircle, Send, Webhook } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Badge, Button, Overlay, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/format";
import type { AlertChannel, AlertPreview } from "@/lib/types";

const CHANNELS: Array<{ key: AlertChannel; label: string; icon: ReactNode }> = [
  { key: "slack", label: "Slack", icon: <Hash className="h-4 w-4" /> },
  { key: "whatsapp", label: "WhatsApp (Twilio)", icon: <MessageCircle className="h-4 w-4" /> },
  { key: "webhook", label: "SOAR Webhook", icon: <Webhook className="h-4 w-4" /> },
];

export function DispatchDialog({ threatId, open, onClose, onSent }: { threatId: string; open: boolean; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const [selected, setSelected] = useState<AlertChannel[]>(["slack", "whatsapp"]);
  const [previewChannel, setPreviewChannel] = useState<AlertChannel>("slack");
  const [preview, setPreview] = useState<AlertPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreview(null);
    setPreviewError(null);
    api
      .alertPreview(threatId, previewChannel)
      .then((p) => !cancelled && setPreview(p))
      .catch((err: unknown) => !cancelled && setPreviewError(err instanceof ApiError ? err.message : "Preview unavailable"));
    return () => {
      cancelled = true;
    };
  }, [open, threatId, previewChannel]);

  const toggle = (c: AlertChannel) => setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  const send = async () => {
    setSending(true);
    try {
      const logs = await api.dispatch(threatId, selected);
      const sent = logs.filter((l) => l.status === "sent").length;
      const skipped = logs.filter((l) => l.status === "skipped");
      const failed = logs.filter((l) => l.status === "failed");
      if (failed.length) toast("error", `${failed.length} alert(s) failed`, failed.map((f) => `${f.channel}: ${f.error ?? f.response_code}`).join("; "));
      if (sent) toast("success", `Alert dispatched on ${sent} channel(s)`);
      if (skipped.length) toast("info", "Some channels are not configured", skipped.map((s) => `${s.channel}: ${s.error}`).join("; "));
      onSent();
      onClose();
    } catch (err) {
      toast("error", "Dispatch failed", err instanceof ApiError ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Overlay open={open} onClose={onClose} title="Dispatch zero-touch alert" widthClass="max-w-3xl">
      <div className="grid gap-4 p-4 md:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Channels</p>
          {CHANNELS.map((c) => (
            <label key={c.key} className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm", selected.includes(c.key) ? "border-cyan-500/50 bg-cyan-500/5 text-slate-100" : "border-ink-700 text-slate-400")}>
              <input type="checkbox" className="accent-cyan-400" checked={selected.includes(c.key)} onChange={() => toggle(c.key)} />
              {c.icon}
              {c.label}
            </label>
          ))}
          <Button variant="danger" className="w-full" loading={sending} disabled={selected.length === 0} onClick={() => void send()}>
            {!sending ? <Send className="h-4 w-4" /> : null}
            Send now
          </Button>
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Payload preview</p>
            <div className="ml-auto flex gap-1">
              {CHANNELS.map((c) => (
                <button key={c.key} type="button" onClick={() => setPreviewChannel(c.key)} className={cn("rounded px-2 py-0.5 text-[11px]", previewChannel === c.key ? "bg-ink-600 text-slate-100" : "text-slate-500 hover:text-slate-300")}>
                  {c.label.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>
          {previewError ? <p className="rounded border border-red-500/30 p-3 text-xs text-red-300">{previewError}</p> : null}
          {!preview && !previewError ? <Spinner label="Formatting payload…" /> : null}
          {preview ? (
            <>
              <Badge className={preview.configured ? "text-emerald-300 bg-emerald-500/10 ring-emerald-500/30" : "text-amber-200 bg-amber-500/10 ring-amber-500/30"}>
                {preview.configured ? "channel configured" : "not configured - will be logged as skipped"}
              </Badge>
              <div className="rounded-md border border-ink-700 bg-ink-850 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Executive summary</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{preview.executive_summary}</p>
                <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-500">Technical summary</p>
                <p className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-slate-300">{preview.technical_summary}</p>
              </div>
              <details className="rounded-md border border-ink-700 bg-black/30">
                <summary className="cursor-pointer px-3 py-2 text-xs text-slate-400">Raw {preview.channel} payload</summary>
                <pre className="max-h-64 overflow-auto px-3 pb-3 font-mono text-[11px] text-slate-300">{JSON.stringify(preview.payload, null, 2)}</pre>
              </details>
            </>
          ) : null}
        </div>
      </div>
    </Overlay>
  );
}

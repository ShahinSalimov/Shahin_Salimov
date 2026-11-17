"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adPackToText, formatTime } from "@/lib/format";
import { DURATIONS, PLATFORM_LABELS, PLATFORMS, STYLE_LABELS, STYLES, TONES, type AdPack } from "@/lib/schema";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export type HistoryItem = { id: string; productName: string; createdAt: string; pack: AdPack };
type PublicPack = { name: string; credits: number; price: string; url: string };

export default function Studio(props: {
  email: string;
  initialCredits: number;
  costPerGeneration: number;
  packs: PublicPack[];
  history: HistoryItem[];
}) {
  const router = useRouter();
  const [credits, setCredits] = useState(props.initialCredits);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; pack: AdPack } | null>(null);
  const [history, setHistory] = useState(props.history);
  const outOfCredits = credits < props.costPerGeneration;

  async function onGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/generate", { method: "POST", body: form });
      const data = await res.json();
      if (typeof data.credits === "number") setCredits(data.credits);
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      const title = String(form.get("productName"));
      setResult({ title, pack: data.pack });
      setHistory((h) => [{ id: data.generationId ?? crypto.randomUUID(), productName: title, createdAt: new Date().toISOString(), pack: data.pack }, ...h]);
      document.getElementById("result")?.scrollIntoView({ behavior: "smooth" });
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    router.push("/");
  }

  return (
    <main className="mx-auto max-w-6xl px-5">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ad Studio</h1>
          <p className="text-sm text-muted">{props.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-xl border border-line px-4 py-2 text-sm">
            <b className="text-brand">{credits}</b> credits
          </span>
          <button onClick={signOut} className="text-sm text-muted hover:text-white">Sign out</button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <form onSubmit={onGenerate} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="productName">Product name</label>
            <input id="productName" name="productName" required minLength={2} maxLength={120} className="field" placeholder="GlowMist Hydrating Face Spray" />
          </div>
          <div>
            <label className="label" htmlFor="productDescription">What is it and why should people buy it?</label>
            <textarea id="productDescription" name="productDescription" required minLength={10} maxLength={2000} rows={4} className="field" placeholder="Rose-water face mist with hyaluronic acid. Refreshes makeup, 100 ml, fits in a handbag. Price $19, free shipping in the US." />
          </div>
          <div>
            <label className="label" htmlFor="targetAudience">Target audience (optional)</label>
            <input id="targetAudience" name="targetAudience" maxLength={300} className="field" placeholder="Women 20-35 who wear makeup daily" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select name="platform" label="Platform" options={PLATFORMS.map((p) => [p, PLATFORM_LABELS[p]])} />
            <Select name="durationSec" label="Duration" defaultValue="30" options={DURATIONS.map((d) => [String(d), `${d} seconds`])} />
            <Select name="style" label="Ad style" options={STYLES.map((s) => [s, STYLE_LABELS[s]])} />
            <Select name="tone" label="Tone" options={TONES.map((t) => [t, t[0].toUpperCase() + t.slice(1)])} />
          </div>
          <div>
            <label className="label" htmlFor="image">Product photo (optional, max 5 MB)</label>
            <input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="field file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-white" />
          </div>
          {error && <p className="rounded-xl bg-brand/10 px-4 py-3 text-sm text-brand">{error}</p>}
          <button disabled={loading || outOfCredits} className="btn-primary w-full">
            {loading ? "Writing your ad… (up to a minute)" : `Generate ad pack · ${props.costPerGeneration} credit`}
          </button>
          {outOfCredits && <p className="text-center text-sm text-muted">You're out of credits. Buy a pack on the right.</p>}
        </form>

        <aside className="space-y-6">
          <RedeemBox onRedeemed={setCredits} />
          <div className="card p-6">
            <h2 className="font-semibold">Buy credits</h2>
            <div className="mt-4 space-y-2">
              {props.packs.map((p) => (
                <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm hover:border-brand">
                  <span>{p.name} · {p.credits} credits</span>
                  <b>{p.price}</b>
                </a>
              ))}
              {props.packs.length === 0 && <p className="text-sm text-muted">No packs configured.</p>}
            </div>
          </div>
          {history.length > 0 && (
            <div className="card p-6">
              <h2 className="font-semibold">Recent ads</h2>
              <ul className="mt-3 space-y-1">
                {history.map((h) => (
                  <li key={h.id}>
                    <button onClick={() => setResult({ title: h.productName, pack: h.pack })} className="w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-muted hover:bg-white/5 hover:text-white">
                      {h.productName} · {new Date(h.createdAt).toLocaleDateString()}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {result && <Result title={result.title} pack={result.pack} />}
    </main>
  );
}

function Select({ name, label, options, defaultValue }: { name: string; label: string; options: [string, string][]; defaultValue?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={defaultValue} className="field">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function RedeemBox({ onRedeemed }: { onRedeemed: (credits: number) => void }) {
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ licenseKey: key }) });
      const data = await res.json();
      if (res.ok) {
        onRedeemed(data.credits);
        setKey("");
        setMsg({ ok: true, text: `Added ${data.added} credits.` });
      } else {
        setMsg({ ok: false, text: data.error ?? "Could not redeem." });
      }
    } catch {
      setMsg({ ok: false, text: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={redeem} className="card space-y-3 p-6">
      <h2 className="font-semibold">Redeem license key</h2>
      <p className="text-xs text-muted">Bought a pack on Gumroad? Paste the license key from your receipt email.</p>
      <input value={key} onChange={(e) => setKey(e.target.value)} required placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" className="field font-mono text-xs" />
      <button disabled={busy || !key} className="btn-ghost w-full">{busy ? "Checking…" : "Add credits"}</button>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-brand"}`}>{msg.text}</p>}
    </form>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-white"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function Result({ title, pack }: { title: string; pack: AdPack }) {
  const allText = adPackToText(pack, title);
  return (
    <section id="result" className="mt-10 scroll-mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">{title}</h2>
        <div className="flex gap-2">
          <CopyButton text={allText} label="Copy everything" />
          <a
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(allText)}`}
            download={`${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-ad.txt`}
            className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-white"
          >
            Download .txt
          </a>
        </div>
      </div>
      <p className="text-muted">{pack.product_summary} <span className="text-white">Audience:</span> {pack.target_audience}</p>

      <div className="grid gap-4 md:grid-cols-3">
        {pack.hooks.map((h, i) => (
          <div key={i} className="card p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-brand">Hook {i + 1} · {h.type}</span>
              <CopyButton text={h.text} />
            </div>
            <p className="font-medium">{h.text}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {pack.scenes.map((s, i) => (
          <div key={i} className="card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-brand px-2.5 py-1 text-xs font-bold">{formatTime(s.start_sec)}–{formatTime(s.end_sec)}</span>
              <span className="text-sm font-semibold">Scene {i + 1} · {s.purpose}</span>
            </div>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <Item k="Visual" v={s.visual} />
              <Item k="Camera" v={s.camera} />
              <Item k="On-screen text" v={s.on_screen_text} />
              <Item k="Voiceover" v={s.voiceover} />
            </dl>
            <PromptBox label="Image prompt" text={s.image_prompt} />
            <PromptBox label="Video prompt" text={s.video_prompt} />
          </div>
        ))}
      </div>

      <div className="card space-y-4 p-5">
        <PromptBox label="Caption" text={pack.caption} />
        <PromptBox label="Hashtags" text={pack.hashtags.join(" ")} />
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <Item k="CTA" v={pack.cta} />
          <Item k="Music" v={pack.music_suggestion} />
        </dl>
      </div>
    </section>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{k}</dt>
      <dd className="mt-1">{v}</dd>
    </div>
  );
}

function PromptBox({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-3 rounded-xl bg-ink p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
        <CopyButton text={text} />
      </div>
      <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{text}</p>
    </div>
  );
}

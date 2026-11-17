"use client";

import { LoaderCircle, Lock, ShieldAlert } from "lucide-react";
import { type FormEvent, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
        setError(typeof body.detail === "string" ? body.detail : "Sign-in failed");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      // Only same-origin relative paths are allowed as redirect targets.
      window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch {
      setError("Network error. Is the dashboard server running?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm space-y-4 rounded-xl border border-ink-700 bg-ink-900/90 p-6 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-cyan-400/30 to-red-500/30 ring-1 ring-cyan-400/40">
            <ShieldAlert className="h-5 w-5 text-cyan-200" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-50">AegisPulse</h1>
            <p className="text-xs text-slate-500">SOC Command Center sign-in</p>
          </div>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-400">Work email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-400">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>
        {error ? (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-cyan-500/20 px-3 py-2 text-sm font-medium text-cyan-100 ring-1 ring-cyan-400/50 hover:bg-cyan-500/30 disabled:opacity-60"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Sign in
        </button>
      </form>
    </div>
  );
}

"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

  async function google() {
    await createBrowserSupabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const { error } = await createBrowserSupabase().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setStatus(error ? "error" : "sent");
  }

  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <div className="card p-8">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-2 text-sm text-muted">New accounts get 3 free ad packs.</p>
        <button onClick={google} className="btn-primary mt-6 w-full">Continue with Google</button>
        <div className="my-6 flex items-center gap-3 text-xs text-muted">
          <div className="h-px flex-1 bg-line" />or<div className="h-px flex-1 bg-line" />
        </div>
        {status === "sent" ? (
          <p className="text-sm">Check your inbox for a sign-in link.</p>
        ) : (
          <form onSubmit={magicLink} className="space-y-3">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="field" />
            <button disabled={status === "sending"} className="btn-ghost w-full">
              {status === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
            {status === "error" && <p className="text-sm text-brand">Could not send the link. Try again.</p>}
          </form>
        )}
      </div>
    </main>
  );
}

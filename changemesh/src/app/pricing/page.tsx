import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/domain/billing/plans";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description: "CHANGEMESH plans for single businesses, multi-location teams, agencies and enterprises.",
};

const FAQ = [
  { q: "Are these prices final?", a: "No. They are proposed test prices while billing runs in Stripe test mode. They have not been validated with customers." },
  { q: "What happens without a subscription?", a: "New organizations work within the Starter limits (1 workspace, 25 assets). Paid limits apply once Stripe confirms a subscription." },
  { q: "What counts as an asset?", a: "Anything that carries business information: a web page, PDF, spreadsheet, product catalog or manually tracked document. Archived assets do not count." },
  { q: "Is AI required?", a: "No. Change detection and impact analysis are rule-based by default. AI-assisted analysis is optional and every AI suggestion is labeled and reviewed before it is applied." },
  { q: "Does CHANGEMESH change my websites automatically?", a: "Never without approval. Every proposed update goes through an approval workflow, and nothing is applied to external systems without a connected integration." },
];

export default function PricingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-2xl py-10 text-center sm:py-16">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Pricing that grows with your business</h1>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">One change, every place it appears. Pick the plan that matches how many assets and workspaces you manage.</p>
          <p className="mt-3 inline-block rounded-full border border-warning/40 bg-warning/12 px-3 py-1 text-xs">Proposed test prices — billing runs in Stripe test mode</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => {
            const featured = p.id === "business";
            return (
              <li key={p.id} className={cn("flex flex-col rounded-2xl border bg-card p-6", featured && "border-primary/60 shadow-lg ring-1 ring-primary/30")}>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{p.name}</h2>
                  {featured ? <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">Most popular</span> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
                <p className="mt-6">
                  {p.priceMonthlyUsd !== null ? (
                    <>
                      <span className="tabular text-4xl font-semibold">${p.priceMonthlyUsd}</span>
                      <span className="text-sm text-muted-foreground"> / month</span>
                    </>
                  ) : (
                    <span className="text-4xl font-semibold">Custom</span>
                  )}
                </p>
                <ul className="mt-6 grid flex-1 gap-2.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-8" variant={featured ? "default" : "outline"}>
                  <Link href="/signup">{p.priceMonthlyUsd === null ? "Create an account" : "Start with " + p.name}</Link>
                </Button>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-center text-xs text-muted-foreground">Plans are chosen after sign-up under Settings → Billing & plan. Enterprise terms are arranged manually.</p>

        <section aria-labelledby="faq" className="mx-auto mt-20 max-w-3xl">
          <h2 id="faq" className="text-2xl font-semibold tracking-tight">
            Questions
          </h2>
          <dl className="mt-6 divide-y border-y">
            {FAQ.map((f) => (
              <div key={f.q} className="py-5">
                <dt className="font-medium">{f.q}</dt>
                <dd className="mt-1.5 text-sm text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </div>
  );
}

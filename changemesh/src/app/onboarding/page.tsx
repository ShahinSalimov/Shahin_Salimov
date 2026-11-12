import type { Metadata } from "next";
import { Building2, Boxes, LayoutGrid } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { getMessages } from "@/i18n/server";
import { requireUser } from "@/server/auth/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up" };

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const t = await getMessages();
  const steps = [
    { icon: Building2, title: "Organization", body: "Your company. Holds billing and people.", active: true },
    { icon: LayoutGrid, title: "Workspace", body: "An isolated space per brand, client or region.", active: true },
    { icon: Boxes, title: "First assets", body: "Register websites, PDFs and spreadsheets next.", active: false },
  ];
  return (
    <div className="min-h-dvh bg-[radial-gradient(70%_50%_at_50%_0%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent)]">
      <div className="mx-auto flex max-w-5xl flex-col px-4 py-8 sm:px-6">
        <Logo href="/app" />
        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div>
            <p className="text-sm text-muted-foreground">Welcome{user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">{t.onboarding.title}</h1>
            <p className="mt-3 text-muted-foreground text-pretty">{t.onboarding.subtitle}</p>
            <ol className="mt-8 grid gap-4">
              {steps.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-lg border ${s.active ? "border-primary/40 bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <s.icon className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">
                      {i + 1}. {s.title}
                    </p>
                    <p className="text-sm text-muted-foreground">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-xl shadow-primary/5 sm:p-8">
            <OnboardingForm t={t} />
          </div>
        </div>
      </div>
    </div>
  );
}

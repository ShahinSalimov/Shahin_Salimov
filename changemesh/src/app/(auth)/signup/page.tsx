import type { Metadata } from "next";
import Link from "next/link";
import { AuthNotConfigured } from "@/components/auth/not-configured";
import { getMessages } from "@/i18n/server";
import { isSupabaseConfigured } from "@/lib/env";
import { isDemoModeEnabled } from "@/server/env.server";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/invite/") ? next : undefined;
  const t = await getMessages();
  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t.auth.signUpTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.auth.signUpSubtitle}</p>
      </div>
      {isSupabaseConfigured() ? (
        <>
          <SignupForm t={t} next={safeNext} />
          <p className="text-center text-sm text-muted-foreground">
            {t.auth.haveAccount}{" "}
            <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={safeNext ? `/login?next=${encodeURIComponent(safeNext)}` : "/login"}>
              {t.common.signIn}
            </Link>
          </p>
        </>
      ) : (
        <AuthNotConfigured t={t} demo={isDemoModeEnabled()} />
      )}
    </div>
  );
}

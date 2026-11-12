import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { AuthNotConfigured } from "@/components/auth/not-configured";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getMessages } from "@/i18n/server";
import { getPublicEnv, isSupabaseConfigured } from "@/lib/env";
import { signInWithGoogleAction } from "@/server/auth/actions";
import { isDemoModeEnabled } from "@/server/env.server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  auth_callback_failed: "That sign-in link is invalid or has expired. Please try again.",
  oauth_failed: "Google sign-in could not be started. Please try again.",
  provider_disabled: "Google sign-in is not enabled for this deployment.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const t = await getMessages();
  const configured = isSupabaseConfigured();
  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t.auth.signInTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.auth.signInSubtitle}</p>
      </div>
      {error && ERRORS[error] ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{ERRORS[error]}</AlertDescription>
        </Alert>
      ) : null}
      {configured ? (
        <>
          {getPublicEnv().NEXT_PUBLIC_AUTH_GOOGLE_ENABLED ? (
            <>
              <form action={signInWithGoogleAction}>
                <input type="hidden" name="next" value={next ?? ""} />
                <Button type="submit" variant="outline" className="w-full">
                  {t.auth.google}
                </Button>
              </form>
              <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {t.common.or}
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          ) : null}
          <LoginForm t={t} next={next} />
          <p className="text-center text-sm text-muted-foreground">
            {t.auth.noAccount}{" "}
            <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/signup">
              {t.common.signUp}
            </Link>
          </p>
        </>
      ) : (
        <AuthNotConfigured t={t} demo={isDemoModeEnabled()} />
      )}
    </div>
  );
}

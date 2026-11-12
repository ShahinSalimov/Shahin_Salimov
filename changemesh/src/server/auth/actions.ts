"use server";

import { redirect } from "next/navigation";
import { safeNextPath, signInSchema, signUpSchema } from "@/domain/auth/schemas";
import { getPublicEnv } from "@/lib/env";
import { AppError, type ActionResult } from "@/lib/errors";
import { formToObject, runAction } from "../action";
import { createUserClient } from "../supabase/clients";
import { headers } from "next/headers";

async function appOrigin(): Promise<string> {
  const configured = getPublicEnv().NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type AuthFormState = ActionResult<{ message?: string }> | null;

export async function signInAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  let target = "/app";
  const result = await runAction("auth.sign_in", async () => {
    const input = signInSchema.parse(formToObject(form));
    const supabase = await createUserClient();
    const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) {
      // Same message for unknown email and wrong password (no account enumeration).
      if (error.code === "email_not_confirmed") throw new AppError("UNAUTHENTICATED", "Please confirm your email address first.");
      throw new AppError("UNAUTHENTICATED", "Incorrect email or password.");
    }
    target = safeNextPath(input.next);
    return {};
  });
  if (result.ok) redirect(target);
  return result;
}

export async function signUpAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  let signedIn = false;
  const result = await runAction("auth.sign_up", async () => {
    const input = signUpSchema.parse(formToObject(form));
    const supabase = await createUserClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.fullName },
        emailRedirectTo: `${await appOrigin()}/auth/callback?next=/onboarding`,
      },
    });
    if (error) {
      if (error.code === "weak_password") throw new AppError("VALIDATION_FAILED", error.message);
      if (error.code === "over_email_send_rate_limit" || error.status === 429) throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a moment.");
      throw new AppError("VALIDATION_FAILED", "We could not create the account. Check your details and try again.");
    }
    signedIn = Boolean(data.session);
    return { message: "Check your inbox to confirm your email address, then sign in." };
  });
  if (result.ok && signedIn) redirect("/onboarding");
  return result;
}

export async function signInWithGoogleAction(form: FormData): Promise<void> {
  if (!getPublicEnv().NEXT_PUBLIC_AUTH_GOOGLE_ENABLED) redirect("/login?error=provider_disabled");
  const next = safeNextPath(typeof form.get("next") === "string" ? (form.get("next") as string) : null);
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await appOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/login?error=oauth_failed");
  redirect(data.url);
}

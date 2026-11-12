"use client";

import { useActionState } from "react";
import { CircleAlert, MailCheck } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Messages } from "@/i18n/messages";
import { signUpAction } from "@/server/auth/actions";

export function SignupForm({ t }: { t: Messages }) {
  const [state, formAction, pending] = useActionState(signUpAction, null);
  if (state?.ok) {
    return (
      <Alert variant="success">
        <MailCheck />
        <AlertDescription>{state.data.message}</AlertDescription>
      </Alert>
    );
  }
  const errors = state && !state.ok ? state.error : undefined;
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {errors && !errors.fieldErrors ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{errors.message}</AlertDescription>
        </Alert>
      ) : null}
      <FormField name="fullName" label={t.common.fullName} autoComplete="name" required errors={errors?.fieldErrors?.fullName} />
      <FormField name="email" type="email" label={t.common.email} autoComplete="email" required errors={errors?.fieldErrors?.email} />
      <FormField
        name="password"
        type="password"
        label={t.common.password}
        autoComplete="new-password"
        required
        hint={t.auth.passwordHint}
        errors={errors?.fieldErrors?.password}
      />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "…" : t.common.signUp}
      </Button>
    </form>
  );
}

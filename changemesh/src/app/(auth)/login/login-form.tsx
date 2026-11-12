"use client";

import { useActionState } from "react";
import { CircleAlert } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Messages } from "@/i18n/messages";
import { signInAction } from "@/server/auth/actions";

export function LoginForm({ t, next }: { t: Messages; next?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, null);
  const errors = state && !state.ok ? state.error : undefined;
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {errors && !errors.fieldErrors ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{errors.message}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="next" value={next ?? ""} />
      <FormField name="email" type="email" label={t.common.email} autoComplete="email" required errors={errors?.fieldErrors?.email} />
      <FormField name="password" type="password" label={t.common.password} autoComplete="current-password" required errors={errors?.fieldErrors?.password} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "…" : t.common.signIn}
      </Button>
    </form>
  );
}

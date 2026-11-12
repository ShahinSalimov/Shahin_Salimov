"use client";

import { useActionState } from "react";
import { CircleAlert } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Messages } from "@/i18n/messages";
import { createOrganizationAction } from "@/server/workspaces/actions";

export function OnboardingForm({ t }: { t: Messages }) {
  const [state, formAction, pending] = useActionState(createOrganizationAction, null);
  const errors = state && !state.ok ? state.error : undefined;
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {errors && !errors.fieldErrors ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{errors.message}</AlertDescription>
        </Alert>
      ) : null}
      <FormField name="organizationName" label={t.onboarding.organizationName} placeholder="Harbor & Vine Hospitality" required errors={errors?.fieldErrors?.organizationName} />
      <FormField name="workspaceName" label={t.onboarding.workspaceName} placeholder="Restaurants" required errors={errors?.fieldErrors?.workspaceName} />
      <Button type="submit" disabled={pending}>
        {pending ? "…" : t.onboarding.submit}
      </Button>
    </form>
  );
}

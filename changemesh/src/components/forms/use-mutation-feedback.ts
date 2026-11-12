"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/errors";

type Feedback = { message?: string; tone?: "warning" };
type State<D> = ActionResult<D> | null;
type Action<D> = (prev: State<D>, form: FormData) => Promise<State<D>>;

/**
 * useActionState + immediate feedback.
 * - The toast is shown as soon as the server answers (not in an effect), so it
 *   still appears when the submitting component unmounts after revalidation.
 * - On failure the submitted values are returned, so inputs can use them as
 *   `defaultValue`. React resets forms after an action; without this the user
 *   would lose what they typed.
 */
export function useMutation<D extends Feedback>(action: Action<D>, onSuccess?: (data: D) => void) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, formAction, pending] = useActionState<State<D>, FormData>(async (prev, form) => {
    const result = await action(prev, form);
    if (result?.ok) {
      setValues({});
      if (result.data.message) (result.data.tone === "warning" ? toast.warning : toast.success)(result.data.message);
      onSuccess?.(result.data);
    } else if (result) {
      const submitted: Record<string, string> = {};
      for (const [k, v] of form.entries()) if (typeof v === "string") submitted[k] = v;
      setValues(submitted);
      if (!result.error.fieldErrors) toast.error(result.error.message);
    }
    return result;
  }, null);
  return [state, formAction, pending, values] as const;
}

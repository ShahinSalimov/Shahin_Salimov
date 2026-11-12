import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FormFieldProps extends ComponentProps<typeof Input> {
  name: string;
  label: string;
  hint?: string;
  errors?: string[];
}

export function FormField({ name, label, hint, errors, id, ...input }: FormFieldProps) {
  const fieldId = id ?? `field-${name}`;
  const describedBy = errors?.length ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input id={fieldId} name={name} aria-invalid={errors?.length ? true : undefined} aria-describedby={describedBy} {...input} />
      {errors?.length ? (
        <p id={`${fieldId}-error`} className="text-xs text-destructive">
          {errors.join(" ")}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

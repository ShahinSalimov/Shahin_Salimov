import { Label } from "@/components/ui/label";

/** Label + control + hint/error, wired with aria attributes. Pass the control as a render function. */
export function Field({
  id,
  label,
  hint,
  errors,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  errors?: string[];
  optional?: boolean;
  children: (aria: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const describedBy = errors?.length ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
      </Label>
      {children({ id, "aria-invalid": errors?.length ? true : undefined, "aria-describedby": describedBy })}
      {errors?.length ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {errors.join(" ")}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

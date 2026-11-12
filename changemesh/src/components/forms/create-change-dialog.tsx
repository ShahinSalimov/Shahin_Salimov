"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranchPlus } from "lucide-react";
import { CHANGE_TYPE_META } from "@/components/app/meta";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CHANGE_TYPES } from "@/domain/workspace/model";
import { createChangeAction } from "@/server/workspaces/mutations";
import { Field } from "./field";
import { useMutation } from "./use-mutation-feedback";

export function CreateChangeDialog({ workspaceId, assets, variant = "default", defaultAssetId }: { workspaceId: string; assets: { id: string; name: string }[]; variant?: "default" | "outline"; defaultAssetId?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const onSuccess = useCallback(
    (data: { id?: string }) => {
      setOpen(false);
      if (data.id) router.push(`/w/${workspaceId}/changes/${data.id}`);
    },
    [router, workspaceId],
  );
  const [state, action, pending, values] = useMutation(createChangeAction, onSuccess);
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <GitBranchPlus />
          Record change
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Register a change</DialogTitle>
          <DialogDescription>Enter the new value. If you choose a source asset and leave “Old value” empty, the current value is read from that asset.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <Field id="change-title" label="Title" errors={errors?.title}>
            {(aria) => <Input name="title" defaultValue={values.title} placeholder="Classic Burger price $12 → $15" required {...aria} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="change-type" label="Type" errors={errors?.type}>
              {(aria) => (
                <NativeSelect name="type" defaultValue={values.type ?? "updated"} {...aria}>
                  {CHANGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CHANGE_TYPE_META[t].label}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field id="change-source" label="Source asset" optional errors={errors?.sourceAssetId}>
              {(aria) => (
                <NativeSelect name="sourceAssetId" defaultValue={values.sourceAssetId ?? defaultAssetId ?? ""} {...aria}>
                  <option value="">None</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field id="change-entity" label="Entity" optional errors={errors?.entityName}>
              {(aria) => <Input name="entityName" defaultValue={values.entityName} placeholder="Classic Burger" {...aria} />}
            </Field>
            <Field id="change-attribute" label="Attribute" optional errors={errors?.attributeName}>
              {(aria) => <Input name="attributeName" defaultValue={values.attributeName} placeholder="price" {...aria} />}
            </Field>
            <Field id="change-old" label="Old value" optional errors={errors?.oldValue}>
              {(aria) => <Input name="oldValue" defaultValue={values.oldValue} placeholder="$12.00" {...aria} />}
            </Field>
            <Field id="change-new" label="New value" optional errors={errors?.newValue}>
              {(aria) => <Input name="newValue" defaultValue={values.newValue} placeholder="$15.00" {...aria} />}
            </Field>
          </div>
          <Field id="change-description" label="Notes" optional errors={errors?.description}>
            {(aria) => <Textarea name="description" defaultValue={values.description} rows={2} {...aria} />}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="analyze" defaultChecked={values.analyze ? values.analyze === "on" : true} className="size-4 accent-[var(--primary)]" />
            Analyze the impact now (rule-based)
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save change"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

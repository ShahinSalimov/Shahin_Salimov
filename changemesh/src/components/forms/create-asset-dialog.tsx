"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ASSET_TYPE_META } from "@/components/app/meta";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ASSET_TYPES, type AssetType } from "@/domain/workspace/model";
import { createAssetAction } from "@/server/workspaces/mutations";
import { Field } from "./field";
import { useMutation } from "./use-mutation-feedback";

export function CreateAssetDialog({ workspaceId, triggerLabel = "Add asset", variant = "default" }: { workspaceId: string; triggerLabel?: string; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<AssetType>("website");
  const router = useRouter();
  const onSuccess = useCallback(
    (data: { id?: string }) => {
      setOpen(false);
      if (data.id) router.push(`/w/${workspaceId}/assets/${data.id}`);
    },
    [router, workspaceId],
  );
  const [state, action, pending, values] = useMutation(createAssetAction, onSuccess);
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Plus />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register an asset</DialogTitle>
          <DialogDescription>Add a place where your business information lives. Scanning and file uploads arrive in the Asset Intelligence stage; for now the asset is registered as “not scanned”.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <Field id="asset-type" label="Type" errors={errors?.type}>
            {(aria) => (
              <NativeSelect name="type" value={type} onChange={(e) => setType(e.target.value as AssetType)} {...aria}>
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ASSET_TYPE_META[t].label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field id="asset-name" label="Name" errors={errors?.name}>
            {(aria) => <Input name="name" defaultValue={values.name} placeholder={type === "website" ? "Website — Menu page" : "Dinner menu.pdf"} required {...aria} />}
          </Field>
          <Field id="asset-url" label="URL" optional={type !== "website"} errors={errors?.sourceUrl} hint="Public http(s) address. It is not fetched yet.">
            {(aria) => <Input name="sourceUrl" defaultValue={values.sourceUrl} type="url" inputMode="url" placeholder="https://example.com/menu" required={type === "website"} {...aria} />}
          </Field>
          <Field id="asset-description" label="Description" optional errors={errors?.description}>
            {(aria) => <Textarea name="description" defaultValue={values.description} rows={3} placeholder="What information does this asset contain?" {...aria} />}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Register asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

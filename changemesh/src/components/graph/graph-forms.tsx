"use client";

import { useState } from "react";
import { Link2, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Field } from "@/components/forms/field";
import { useMutation } from "@/components/forms/use-mutation-feedback";
import { RELATIONSHIP_LABEL } from "@/components/app/meta";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { RELATIONSHIP_TYPES } from "@/domain/workspace/model";
import { createRelationshipAction, deleteRelationshipAction, suggestRelationshipsAction } from "@/server/workspaces/graph-actions";

const TYPE_HELP: Record<string, string> = {
  derived_from: "Source content is copied or generated from the target (menu page ← price list).",
  embeds: "Source includes the target directly (homepage embeds the menu).",
  links_to: "Source links to the target.",
  syncs_with: "Both are kept in sync by a system (POS ↔ price list).",
  references: "Source mentions information from the target.",
  duplicates: "Both contain the same information.",
};

export function SuggestButton({ workspaceId }: { workspaceId: string }) {
  const [, action, pending] = useMutation(suggestRelationshipsAction);
  return (
    <form action={action}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {pending ? "Analyzing…" : "Suggest relationships"}
      </Button>
    </form>
  );
}

export function AddRelationshipDialog({ workspaceId, assets, defaultSource }: { workspaceId: string; assets: { id: string; name: string }[]; defaultSource?: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("derived_from");
  const [state, action, pending, values] = useMutation(createRelationshipAction, () => setOpen(false));
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;
  const sorted = [...assets].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Link2 />
          Add relationship
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a relationship</DialogTitle>
          <DialogDescription>Relationships you create are confirmed immediately and used for impact analysis.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <Field id="rel-source" label="Source asset" errors={errors?.sourceAssetId}>
            {(aria) => (
              <NativeSelect name="sourceAssetId" defaultValue={values.sourceAssetId ?? defaultSource ?? ""} required {...aria}>
                <option value="" disabled>
                  Choose…
                </option>
                {sorted.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field id="rel-type" label="Relationship" hint={TYPE_HELP[type]} errors={errors?.type}>
            {(aria) => (
              <NativeSelect name="type" value={type} onChange={(e) => setType(e.target.value)} {...aria}>
                {RELATIONSHIP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {RELATIONSHIP_LABEL[t]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field id="rel-target" label="Target asset" errors={errors?.targetAssetId}>
            {(aria) => (
              <NativeSelect name="targetAssetId" defaultValue={values.targetAssetId ?? ""} required {...aria}>
                <option value="" disabled>
                  Choose…
                </option>
                {sorted.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field id="rel-note" label="Note" optional errors={errors?.note}>
            {(aria) => <Textarea name="note" rows={2} defaultValue={values.note} {...aria} />}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Create relationship"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveRelationshipButton({ workspaceId, relationshipId, label, onDone }: { workspaceId: string; relationshipId: string; label: string; onDone?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [, action, pending] = useMutation(deleteRelationshipAction, onDone);
  if (!confirming)
    return (
      <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirming(true)} aria-label={`Remove relationship: ${label}`}>
        <Trash2 />
        Remove
      </Button>
    );
  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <Button size="sm" variant="destructive" type="submit" disabled={pending}>
        {pending ? "Removing…" : "Confirm remove"}
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </form>
  );
}

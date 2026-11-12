"use client";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reviewRelationshipAction } from "@/server/workspaces/mutations";
import { useMutation } from "./use-mutation-feedback";

export function RelationshipReview({ workspaceId, relationshipId, label }: { workspaceId: string; relationshipId: string; label: string }) {
  const [, action, pending] = useMutation(reviewRelationshipAction);
  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <Button size="sm" variant="outline" name="status" value="confirmed" disabled={pending} aria-label={`Confirm: ${label}`}>
        <Check />
        Confirm
      </Button>
      <Button size="sm" variant="ghost" name="status" value="rejected" disabled={pending} aria-label={`Reject: ${label}`}>
        <X />
        Reject
      </Button>
    </form>
  );
}

"use client";

import { useCallback, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { decideProposalAction } from "@/server/workspaces/mutations";
import { Field } from "./field";
import { useMutation } from "./use-mutation-feedback";

type Decision = "approved" | "rejected" | "needs_revision";

const COPY: Record<Decision, { title: string; cta: string; description: string }> = {
  approved: { title: "Approve this update?", cta: "Approve", description: "Approval records your decision. It does not publish anything externally — execution is a separate, explicit step." },
  needs_revision: { title: "Request a revision", cta: "Send back", description: "Explain what should change. The proposal returns to the editor." },
  rejected: { title: "Reject this update", cta: "Reject", description: "Explain why. Rejected proposals cannot be approved later." },
};

/** Approve / request revision / reject with a confirmation dialog. Rendered only for admins and owners. */
export function DecisionControls({ workspaceId, proposalId, target, compact = false }: { workspaceId: string; proposalId: string; target: string; compact?: boolean }) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const onSuccess = useCallback(() => setDecision(null), []);
  const [state, action, pending, values] = useMutation(decideProposalAction, onSuccess);
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;
  const copy = decision ? COPY[decision] : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" onClick={() => setDecision("approved")} aria-label={`Approve update for ${target}`}>
          <Check />
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDecision("needs_revision")} aria-label={`Request revision for ${target}`}>
          <RotateCcw />
          {compact ? <span className="sr-only sm:not-sr-only">Revise</span> : "Request revision"}
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDecision("rejected")} aria-label={`Reject update for ${target}`}>
          <X />
          <span className={compact ? "sr-only sm:not-sr-only" : undefined}>Reject</span>
        </Button>
      </div>
      <Dialog open={decision !== null} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent>
          {copy && decision ? (
            <form action={action} className="grid gap-4">
              <DialogHeader>
                <DialogTitle>{copy.title}</DialogTitle>
                <DialogDescription>
                  <span className="font-medium text-foreground">{target}.</span> {copy.description}
                </DialogDescription>
              </DialogHeader>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="proposalId" value={proposalId} />
              <input type="hidden" name="decision" value={decision} />
              <Field id="decision-comment" label="Comment" optional={decision === "approved"} errors={errors?.comment}>
                {(aria) => <Textarea name="comment" defaultValue={values.comment} rows={3} required={decision !== "approved"} autoFocus={decision !== "approved"} {...aria} />}
              </Field>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDecision(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending} variant={decision === "rejected" ? "destructive" : "default"}>
                  {pending ? "Saving…" : copy.cta}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

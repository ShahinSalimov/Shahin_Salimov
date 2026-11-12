"use client";

import { useState } from "react";
import { Eye, Loader2, Pencil, Play, RotateCcw, Undo2 } from "lucide-react";
import { Field } from "@/components/forms/field";
import { useMutation } from "@/components/forms/use-mutation-feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { executeProposalAction, reviseProposalAction, rollbackProposalAction, simulateProposalAction } from "@/server/workspaces/update-actions";

interface Ref {
  workspaceId: string;
  proposalId: string;
  target: string;
}

export function ReviseDialog({ workspaceId, proposalId, target, proposedValue, reason }: Ref & { proposedValue: string | null; reason: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending, values] = useMutation(reviseProposalAction, () => setOpen(false));
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Pencil />
          Revise
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revise the update for {target}</DialogTitle>
          <DialogDescription>After you submit, the proposal goes back to the approvers.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="proposalId" value={proposalId} />
          <Field id="rev-value" label="Proposed value" errors={errors?.proposedValue}>
            {(aria) => <Input name="proposedValue" defaultValue={values.proposedValue ?? proposedValue ?? ""} {...aria} />}
          </Field>
          <Field id="rev-reason" label="Instruction" errors={errors?.reason}>
            {(aria) => <Textarea name="reason" rows={3} defaultValue={values.reason ?? reason ?? ""} {...aria} />}
          </Field>
          <Field id="rev-note" label="What did you change?" errors={errors?.note}>
            {(aria) => <Input name="note" required minLength={3} defaultValue={values.note} placeholder="Used the wording Marketing approved" {...aria} />}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Submitting…" : "Submit revision"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PreviewButton({ workspaceId, proposalId }: Omit<Ref, "target">) {
  const [, action, pending] = useMutation(simulateProposalAction);
  return (
    <form action={action}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="proposalId" value={proposalId} />
      <Button size="sm" variant="outline" type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Eye />}
        Preview
      </Button>
    </form>
  );
}

export function ExecuteDialog({ workspaceId, proposalId, target, mode, label, steps, retry }: Ref & { mode: "internal" | "manual"; label: string; steps: string[]; retry: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending, values] = useMutation(executeProposalAction, () => setOpen(false));
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" aria-label={`${retry ? "Retry" : label}: ${target}`}>
          {retry ? <RotateCcw /> : <Play />}
          {retry ? "Retry" : label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "internal" ? `Apply the update to ${target}` : `Confirm the update of ${target}`}</DialogTitle>
          <DialogDescription>
            {mode === "internal" ? "This changes the record inside CHANGEMESH. It can be undone." : "CHANGEMESH does not change external systems. Apply the update yourself, then confirm it here."}
          </DialogDescription>
        </DialogHeader>
        <ol className="grid list-decimal gap-1 pl-5 text-sm text-muted-foreground">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="proposalId" value={proposalId} />
          {mode === "manual" ? (
            <Field id="exec-note" label="How was it applied?" errors={errors?.note}>
              {(aria) => <Textarea name="note" rows={2} required defaultValue={values.note} placeholder="Updated the menu page in the CMS and published it" {...aria} />}
            </Field>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Working…" : mode === "internal" ? "Apply update" : "Confirm applied"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RollbackButton({ workspaceId, proposalId, target, label }: Ref & { label: string }) {
  const [confirming, setConfirming] = useState(false);
  const [, action, pending] = useMutation(rollbackProposalAction, () => setConfirming(false));
  if (!confirming)
    return (
      <Button size="sm" variant="outline" onClick={() => setConfirming(true)} aria-label={`${label}: ${target}`}>
        <Undo2 />
        {label}
      </Button>
    );
  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="proposalId" value={proposalId} />
      <Button size="sm" variant="destructive" type="submit" disabled={pending}>
        {pending ? "Working…" : `Confirm ${label.toLowerCase()}`}
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </form>
  );
}

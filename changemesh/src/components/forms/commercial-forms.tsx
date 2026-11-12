"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Plus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  acceptInvitationAction,
  createApiKeyAction,
  createWorkspaceAction,
  inviteMemberAction,
  markNotificationsReadAction,
  openBillingPortalAction,
  renameOrganizationAction,
  revokeApiKeyAction,
  revokeInvitationAction,
  startCheckoutAction,
} from "@/server/commercial/actions";
import { Field } from "./field";
import { useMutation } from "./use-mutation-feedback";

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={value} aria-label={label} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success("Copied to clipboard.");
          } catch {
            toast.error("Copy failed. Select the text and copy it manually.");
          }
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

export function InviteMemberForm({ workspaceId, canInviteAdmin, disabledReason }: { workspaceId: string; canInviteAdmin: boolean; disabledReason?: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [state, action, pending, values] = useMutation(inviteMemberAction, (d) => setLink(d.link ?? null));
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;
  const disabled = Boolean(disabledReason);
  return (
    <div className="grid gap-3">
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <Field id="invite-email" label="Email address" errors={errors?.email} hint={disabledReason}>
          {(aria) => <Input name="email" type="email" autoComplete="off" placeholder="colleague@company.com" defaultValue={values.email} disabled={disabled} required {...aria} />}
        </Field>
        <Field id="invite-role" label="Role" errors={errors?.role}>
          {(aria) => (
            <NativeSelect name="role" defaultValue={values.role ?? "editor"} disabled={disabled} {...aria}>
              {canInviteAdmin ? <option value="admin">Admin</option> : null}
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </NativeSelect>
          )}
        </Field>
        <Button type="submit" disabled={pending || disabled}>
          <UserPlus /> {pending ? "Creating…" : "Create invitation"}
        </Button>
      </form>
      {link ? (
        <Alert>
          <AlertDescription className="grid gap-2">
            <span>Share this link with the invitee. It works once, for that email address only, and expires in 7 days. It will not be shown again.</span>
            <CopyValue value={link} label="invitation link" />
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export function RevokeInvitationButton({ workspaceId, invitationId, email }: { workspaceId: string; invitationId: string; email: string }) {
  const [, action, pending] = useMutation(revokeInvitationAction);
  return (
    <form action={action}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} aria-label={`Revoke invitation for ${email}`}>
        <X /> {pending ? "Revoking…" : "Revoke"}
      </Button>
    </form>
  );
}

export function AcceptInvitationForm({ token }: { token: string }) {
  const [, action, pending] = useMutation(acceptInvitationAction);
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
    </form>
  );
}

export function CreateApiKeyDialog({ workspaceId, disabledReason }: { workspaceId: string; disabledReason?: string }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [state, action, pending, values] = useMutation(createApiKeyAction, (d) => setSecret(d.secret ?? null));
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSecret(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={Boolean(disabledReason)} title={disabledReason}>
          <KeyRound /> New API key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{secret ? "Copy your API key" : "Create an API key"}</DialogTitle>
          <DialogDescription>{secret ? "This is the only time the full key is shown. Store it in a secret manager." : "Keys belong to this workspace. Read keys can list data; read & write keys can also register changes."}</DialogDescription>
        </DialogHeader>
        {secret ? (
          <div className="grid gap-4">
            <CopyValue value={secret} label="API key" />
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form action={action} className="grid gap-4">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <Field id="key-name" label="Name" errors={errors?.name} hint="For example: “POS sync” or “Zapier”.">
              {(aria) => <Input name="name" defaultValue={values.name} required minLength={2} maxLength={80} {...aria} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="key-access" label="Access" errors={errors?.access}>
                {(aria) => (
                  <NativeSelect name="access" defaultValue={values.access ?? "read"} {...aria}>
                    <option value="read">Read only</option>
                    <option value="read_write">Read &amp; write</option>
                  </NativeSelect>
                )}
              </Field>
              <Field id="key-expiry" label="Expires" errors={errors?.expiresInDays}>
                {(aria) => (
                  <NativeSelect name="expiresInDays" defaultValue={values.expiresInDays ?? "90"} {...aria}>
                    <option value="30">In 30 days</option>
                    <option value="90">In 90 days</option>
                    <option value="365">In 1 year</option>
                    <option value="never">Never</option>
                  </NativeSelect>
                )}
              </Field>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RevokeApiKeyButton({ workspaceId, keyId, name }: { workspaceId: string; keyId: string; name: string }) {
  const [confirm, setConfirm] = useState(false);
  const [, action, pending] = useMutation(revokeApiKeyAction);
  if (!confirm)
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirm(true)} aria-label={`Revoke ${name}`}>
        Revoke
      </Button>
    );
  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="keyId" value={keyId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {pending ? "Revoking…" : "Confirm revoke"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirm(false)}>
        Cancel
      </Button>
    </form>
  );
}

export function MarkNotificationsRead({ workspaceId, notificationId, label }: { workspaceId: string; notificationId?: string; label: string }) {
  const [, action, pending] = useMutation(markNotificationsReadAction);
  return (
    <form action={action}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {notificationId ? <input type="hidden" name="notificationId" value={notificationId} /> : null}
      <Button type="submit" variant="ghost" size="sm" disabled={pending} className="h-7 px-2 text-xs">
        {label}
      </Button>
    </form>
  );
}

export function RenameOrganizationForm({ workspaceId, name, disabledReason }: { workspaceId: string; name: string; disabledReason?: string }) {
  const [state, action, pending, values] = useMutation(renameOrganizationAction);
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="flex-1">
        <Field id="org-name" label="Organization name" errors={errors?.name} hint={disabledReason}>
          {(aria) => <Input name="name" defaultValue={values.name ?? name} disabled={Boolean(disabledReason)} required {...aria} />}
        </Field>
      </div>
      {disabledReason ? null : (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      )}
    </form>
  );
}

export function CreateWorkspaceForm({ workspaceId, disabledReason }: { workspaceId: string; disabledReason?: string }) {
  const [state, action, pending, values] = useMutation(createWorkspaceAction);
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="flex-1">
        <Field id="new-ws" label="New workspace" errors={errors?.name} hint={disabledReason ?? "For another location, brand or client."}>
          {(aria) => <Input name="name" placeholder="e.g. Downtown location" defaultValue={values.name} disabled={Boolean(disabledReason)} required {...aria} />}
        </Field>
      </div>
      <Button type="submit" variant="outline" disabled={pending || Boolean(disabledReason)}>
        <Plus /> {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}

export function CheckoutButton({ workspaceId, plan, label, disabledReason, variant = "default" }: { workspaceId: string; plan: string; label: string; disabledReason?: string; variant?: "default" | "outline" }) {
  const [, action, pending] = useMutation(startCheckoutAction);
  return (
    <form action={action} className="grid">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="plan" value={plan} />
      <Button type="submit" variant={variant} disabled={pending || Boolean(disabledReason)} title={disabledReason}>
        {pending ? "Opening Stripe…" : label}
      </Button>
    </form>
  );
}

export function BillingPortalButton({ workspaceId, disabledReason }: { workspaceId: string; disabledReason?: string }) {
  const [, action, pending] = useMutation(openBillingPortalAction);
  return (
    <form action={action}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending || Boolean(disabledReason)} title={disabledReason}>
        {pending ? "Opening…" : "Manage billing in Stripe"}
      </Button>
    </form>
  );
}

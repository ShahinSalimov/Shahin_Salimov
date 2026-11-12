"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { WORKSPACE_ROLES, type WorkspaceRole } from "@/domain/rbac/roles";
import { cn } from "@/lib/utils";
import { removeMemberAction, renameWorkspaceAction, updateMemberRoleAction, updateProfileAction } from "@/server/workspaces/mutations";
import { Field } from "./field";
import { useMutation } from "./use-mutation-feedback";

export function RenameWorkspaceForm({ workspaceId, name, disabled }: { workspaceId: string; name: string; disabled: boolean }) {
  const [state, action, pending, values] = useMutation(renameWorkspaceAction);
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="flex-1">
        <Field id="ws-name" label="Workspace name" errors={errors?.name} hint={disabled ? "Only admins and owners can rename the workspace." : undefined}>
          {(aria) => <Input name="name" defaultValue={values.name ?? name} disabled={disabled} required {...aria} />}
        </Field>
      </div>
      {disabled ? null : (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      )}
    </form>
  );
}

export function ProfileForm({ fullName, locale }: { fullName: string; locale: string }) {
  const [state, action, pending, values] = useMutation(updateProfileAction);
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
      <Field id="profile-name" label="Full name" errors={errors?.fullName}>
        {(aria) => <Input name="fullName" defaultValue={values.fullName ?? fullName} autoComplete="name" required {...aria} />}
      </Field>
      <Field id="profile-locale" label="Language" errors={errors?.locale}>
        {(aria) => (
          <NativeSelect name="locale" defaultValue={values.locale ?? locale} {...aria}>
            <option value="en">English</option>
            <option value="az">Azərbaycanca</option>
            <option value="tr">Türkçe</option>
          </NativeSelect>
        )}
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const options = [
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
    { key: "system", label: "System", icon: Monitor },
  ] as const;
  return (
    <div className="grid grid-cols-3 gap-2 sm:max-w-md" role="radiogroup" aria-label="Theme">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={theme === o.key}
          onClick={() => setTheme(o.key)}
          className={cn("flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted focus-visible:outline-2", theme === o.key && "border-primary bg-accent")}
        >
          <o.icon className="size-4" aria-hidden="true" />
          {o.label}
        </button>
      ))}
    </div>
  );
}

const ROLE_LABEL: Record<WorkspaceRole, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };

export function MemberRoleSelect({ workspaceId, userId, role, assignable, name }: { workspaceId: string; userId: string; role: WorkspaceRole; assignable: WorkspaceRole[]; name: string }) {
  const [, action, pending] = useMutation(updateMemberRoleAction);
  return (
    <form action={action} className="w-32">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="userId" value={userId} />
      <NativeSelect
        name="role"
        defaultValue={role}
        disabled={pending}
        aria-label={`Role for ${name}`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-8"
      >
        {WORKSPACE_ROLES.filter((r) => r === role || assignable.includes(r)).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </NativeSelect>
    </form>
  );
}

export function RemoveMemberButton({ workspaceId, userId, name }: { workspaceId: string; userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [, action, pending] = useMutation(removeMemberAction, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Remove ${name}`} className="text-muted-foreground hover:text-destructive">
          <UserMinus />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {name}?</DialogTitle>
          <DialogDescription>They lose access to this workspace immediately. Their past actions stay in the audit log.</DialogDescription>
        </DialogHeader>
        <form action={action}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="userId" value={userId} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Removing…" : "Remove member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { addManualFactAction, deleteAssetAction, deleteFactAction, scanAssetAction, updateAssetAction, uploadAssetFileAction } from "@/server/workspaces/asset-actions";
import { Field } from "./field";
import { useMutation } from "./use-mutation-feedback";

interface AssetRef {
  workspaceId: string;
  assetId: string;
}

export function EditAssetDialog({ workspaceId, assetId, name, description, sourceUrl, isCustomerFacing, urlRequired }: AssetRef & { name: string; description: string | null; sourceUrl: string | null; isCustomerFacing: boolean; urlRequired: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending, values] = useMutation(updateAssetAction, () => setOpen(false));
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit asset details</DialogTitle>
          <DialogDescription>Changing details does not rescan the asset or change its extracted information.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="assetId" value={assetId} />
          <Field id="edit-name" label="Name" errors={errors?.name}>
            {(aria) => <Input name="name" defaultValue={values.name ?? name} required {...aria} />}
          </Field>
          <Field id="edit-url" label="URL" optional={!urlRequired} errors={errors?.sourceUrl}>
            {(aria) => <Input name="sourceUrl" type="url" defaultValue={values.sourceUrl ?? sourceUrl ?? ""} required={urlRequired} {...aria} />}
          </Field>
          <Field id="edit-description" label="Description" optional errors={errors?.description}>
            {(aria) => <Textarea name="description" rows={3} defaultValue={values.description ?? description ?? ""} {...aria} />}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isCustomerFacing" defaultChecked={values.isCustomerFacing ? values.isCustomerFacing === "on" : isCustomerFacing} className="size-4 accent-[var(--primary)]" />
            Customers see this asset (used to rank impact)
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAssetDialog({ workspaceId, assetId, name, factsCount, versions }: AssetRef & { name: string; factsCount: number; versions: number }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useMutation(deleteAssetAction);
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTyped("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this asset?</DialogTitle>
          <DialogDescription>
            This permanently removes <span className="font-medium text-foreground">{name}</span>, {versions} version(s), {factsCount} current fact(s), its scan history, relationships and update proposals. The audit log keeps a record of the deletion.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="assetId" value={assetId} />
          <Field id="confirm-name" label={`Type “${name}” to confirm`} errors={errors?.confirmName}>
            {(aria) => <Input name="confirmName" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" {...aria} />}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending || typed.trim() !== name.trim()}>
              {pending ? "Deleting…" : "Delete asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ScanButton({ workspaceId, assetId, label = "Scan now" }: AssetRef & { label?: string }) {
  const [, action, pending] = useMutation(scanAssetAction);
  return (
    <form action={action}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="assetId" value={assetId} />
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {pending ? "Scanning… up to 30 s" : label}
      </Button>
    </form>
  );
}

export function UploadForm({ workspaceId, assetId, accept, hint }: AssetRef & { accept: string; hint: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [state, action, pending] = useMutation(uploadAssetFileAction, () => {
    setFileName(null);
    formRef.current?.reset();
  });
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;

  return (
    <form ref={formRef} action={action} className="grid gap-3">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="assetId" value={assetId} />
      <label
        htmlFor={`upload-${assetId}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file && inputRef.current) {
            const dt = new DataTransfer();
            dt.items.add(file);
            inputRef.current.files = dt.files;
            setFileName(file.name);
          }
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-accent/40 focus-within:ring-[3px] focus-within:ring-ring/50",
          dragging && "border-primary bg-accent/60",
          errors?.file && "border-destructive",
        )}
      >
        <FileUp className="size-5 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium">{fileName ?? "Choose a file or drop it here"}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
        <input
          ref={inputRef}
          id={`upload-${assetId}`}
          name="file"
          type="file"
          accept={accept}
          required
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          aria-describedby={errors?.file ? `upload-${assetId}-error` : undefined}
        />
      </label>
      {errors?.file ? (
        <p id={`upload-${assetId}-error`} className="text-xs text-destructive">
          {errors.file.join(" ")}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || !fileName}>
        {pending ? <Loader2 className="animate-spin" /> : <FileUp />}
        {pending ? "Analyzing…" : "Upload and analyze"}
      </Button>
    </form>
  );
}

export function AddFactDialog({ workspaceId, assetId, defaultEntity }: AssetRef & { defaultEntity: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending, values] = useMutation(addManualFactAction, () => setOpen(false));
  const errors = state && !state.ok ? state.error.fieldErrors : undefined;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus />
          Add fact
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a fact manually</DialogTitle>
          <DialogDescription>Manual facts have 100% confidence and stay valid when the asset is scanned again.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="assetId" value={assetId} />
          <Field id="fact-entity" label="Entity" hint="What the fact is about, e.g. “Classic Burger” or “Downtown location”." errors={errors?.entityName}>
            {(aria) => <Input name="entityName" defaultValue={values.entityName ?? defaultEntity} required {...aria} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="fact-attribute" label="Attribute" errors={errors?.attributeName}>
              {(aria) => <Input name="attributeName" defaultValue={values.attributeName} placeholder="price" list="fact-attributes" required {...aria} />}
            </Field>
            <Field id="fact-value" label="Value" errors={errors?.value}>
              {(aria) => <Input name="value" defaultValue={values.value} placeholder="$15.00" required {...aria} />}
            </Field>
          </div>
          <datalist id="fact-attributes">
            {["price", "opening hours", "phone", "email", "address", "availability", "description"].map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save fact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteFactButton({ workspaceId, factId, label }: { workspaceId: string; factId: string; label: string }) {
  const [, action, pending] = useMutation(deleteFactAction);
  return (
    <form action={action}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="factId" value={factId} />
      <Button type="submit" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" disabled={pending} aria-label={`Delete fact ${label}`}>
        <X className="size-3.5" />
      </Button>
    </form>
  );
}

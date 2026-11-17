"use client";

import { Check, Copy, KeyRound, Users } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { Badge, Button, Overlay, Spinner, Tabs } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, copyText } from "@/lib/api";
import { cn, timeAgo } from "@/lib/format";
import type { ApiKeyInfo, AuditEntry, Role, TeamUser } from "@/lib/types";

const ROLES: Role[] = ["viewer", "analyst", "admin"];
const inputCls = "w-full rounded-md border border-ink-600 bg-ink-850 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500";

function errMsg(err: unknown): string {
  return err instanceof ApiError ? err.message : String(err);
}

function UsersPanel({ currentEmail }: { currentEmail: string | null }) {
  const toast = useToast();
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [form, setForm] = useState({ email: "", name: "", role: "analyst" as Role, password: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.users().then(setUsers).catch((e: unknown) => toast("error", "Could not load users", errMsg(e)));
  }, [toast]);
  useEffect(load, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createUser(form);
      toast("success", "User created", `${form.email} can now sign in.`);
      setForm({ email: "", name: "", role: "analyst", password: "" });
      load();
    } catch (err) {
      toast("error", "Could not create user", errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const update = async (u: TeamUser, body: { role?: Role; is_active?: boolean }) => {
    try {
      await api.updateUser(u.id, body);
      load();
    } catch (err) {
      toast("error", "Update failed", errMsg(err));
    }
  };

  return (
    <div className="space-y-4">
      {!users ? <Spinner /> : null}
      <ul className="space-y-1.5">
        {users?.map((u) => {
          const self = u.email === currentEmail;
          return (
            <li key={u.id} className={cn("flex flex-wrap items-center gap-2 rounded-md border border-ink-700 bg-ink-850 px-3 py-2", !u.is_active && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-100">
                  {u.name} {self ? <span className="text-xs text-slate-500">(you)</span> : null}
                </p>
                <p className="truncate font-mono text-[11px] text-slate-500">
                  {u.email} · {u.last_login_at ? `last login ${timeAgo(u.last_login_at)}` : "never signed in"}
                </p>
              </div>
              <select
                aria-label={`Role for ${u.email}`}
                value={u.role}
                disabled={self}
                onChange={(e) => void update(u, { role: e.target.value as Role })}
                className="rounded border border-ink-600 bg-ink-800 px-1.5 py-1 text-xs text-slate-200 disabled:opacity-50"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <Button size="sm" variant={u.is_active ? "ghost" : "success"} disabled={self} onClick={() => void update(u, { is_active: !u.is_active })}>
                {u.is_active ? "Deactivate" : "Reactivate"}
              </Button>
            </li>
          );
        })}
      </ul>
      <form onSubmit={(e) => void create(e)} className="space-y-2 rounded-lg border border-ink-700 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Add user</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={inputCls} required type="email" placeholder="email@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={inputCls} required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input
            className={inputCls}
            required
            type="password"
            minLength={12}
            autoComplete="new-password"
            placeholder="Initial password (12+ chars)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} aria-label="Role">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="primary" loading={saving}>
          Create user
        </Button>
      </form>
    </div>
  );
}

function KeysPanel() {
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("analyst");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api.apiKeys().then(setKeys).catch((e: unknown) => toast("error", "Could not load API keys", errMsg(e)));
  }, [toast]);
  useEffect(load, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createApiKey(name, role);
      setFresh(created.key ?? null);
      setName("");
      load();
    } catch (err) {
      toast("error", "Could not create key", errMsg(err));
    }
  };

  const revoke = async (k: ApiKeyInfo) => {
    try {
      await api.revokeApiKey(k.id);
      toast("info", "API key revoked", k.name);
      load();
    } catch (err) {
      toast("error", "Revoke failed", errMsg(err));
    }
  };

  return (
    <div className="space-y-4">
      {fresh ? (
        <div className="space-y-2 rounded-lg border border-amber-400/40 bg-amber-400/[0.06] p-3">
          <p className="text-xs text-amber-100">Copy this key now. It will not be shown again.</p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-black/40 px-2 py-1.5 font-mono text-[11px] text-slate-100">{fresh}</code>
            <Button
              size="sm"
              onClick={() =>
                void copyText(fresh).then(
                  () => setCopied(true),
                  () => toast("error", "Copy failed"),
                )
              }
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => { setFresh(null); setCopied(false); }}>
            Done
          </Button>
        </div>
      ) : null}
      {!keys ? <Spinner /> : null}
      {keys && keys.length === 0 ? <p className="text-xs text-slate-500">No API keys yet. Create one for collectors, SIEM forwarders or scripts.</p> : null}
      <ul className="space-y-1.5">
        {keys?.map((k) => (
          <li key={k.id} className={cn("flex flex-wrap items-center gap-2 rounded-md border border-ink-700 bg-ink-850 px-3 py-2", k.revoked_at && "opacity-50")}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-slate-100">{k.name}</p>
              <p className="truncate font-mono text-[11px] text-slate-500">
                {k.prefix}… · {k.last_used_at ? `used ${timeAgo(k.last_used_at)}` : "never used"} · by {k.created_by ?? "?"}
              </p>
            </div>
            <Badge className="text-slate-300 bg-slate-500/10 ring-slate-500/30">{k.role}</Badge>
            {k.revoked_at ? (
              <Badge className="text-red-300 bg-red-500/10 ring-red-500/30">revoked</Badge>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => void revoke(k)}>
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => void create(e)} className="flex flex-wrap gap-2 rounded-lg border border-ink-700 p-3">
        <input className={cn(inputCls, "min-w-[160px] flex-1")} required placeholder="Key name, e.g. splunk-forwarder" value={name} onChange={(e) => setName(e.target.value)} />
        <select className={cn(inputCls, "w-auto")} value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Key role">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button type="submit" variant="primary">
          <KeyRound className="h-4 w-4" /> Create key
        </Button>
      </form>
    </div>
  );
}

function AuditPanel() {
  const toast = useToast();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  useEffect(() => {
    api.auditLog().then(setEntries).catch((e: unknown) => toast("error", "Could not load audit log", errMsg(e)));
  }, [toast]);
  if (!entries) return <Spinner />;
  if (entries.length === 0) return <p className="text-xs text-slate-500">No audit events yet.</p>;
  return (
    <ul className="space-y-1">
      {entries.map((e) => (
        <li key={e.id} className="rounded-md border border-ink-700 bg-ink-850 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-cyan-300">{e.action}</span>
            {e.outcome !== "success" ? <Badge className="text-red-300 bg-red-500/10 ring-red-500/30">{e.outcome}</Badge> : null}
            <span className="truncate text-slate-300">{e.actor}</span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">{timeAgo(e.created_at)}</span>
          </div>
          <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">
            {e.target_type ? `${e.target_type}:${e.target_id ?? ""}` : ""} {e.ip ? `· ${e.ip}` : ""} {e.details ? `· ${JSON.stringify(e.details)}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function TeamDrawer({ open, onClose, currentEmail }: { open: boolean; onClose: () => void; currentEmail: string | null }) {
  const [tab, setTab] = useState<"users" | "keys" | "audit">("users");
  return (
    <Overlay
      open={open}
      onClose={onClose}
      side="right"
      title={
        <span className="flex items-center gap-2">
          <Users className="h-4 w-4 text-cyan-300" /> Team, API access & audit
        </span>
      }
    >
      <Tabs<"users" | "keys" | "audit">
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "users", label: "Users" },
          { key: "keys", label: "API keys" },
          { key: "audit", label: "Audit log" },
        ]}
      />
      <div className="p-4">
        {open && tab === "users" ? <UsersPanel currentEmail={currentEmail} /> : null}
        {open && tab === "keys" ? <KeysPanel /> : null}
        {open && tab === "audit" ? <AuditPanel /> : null}
      </div>
    </Overlay>
  );
}

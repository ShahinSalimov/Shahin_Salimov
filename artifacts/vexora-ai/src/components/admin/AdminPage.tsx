import { useCallback, useEffect, useState } from 'react';
import { Info, Lock, RefreshCw, Search } from 'lucide-react';
import { CURRENCIES, type AdminSummary, type AdminUser, type Currency, type PaymentDTO, type PaymentStatus } from '@workspace/vexora-core';
import { useApp } from '@/store/AppStore';
import { useI18n, type TKey } from '@/i18n';
import { backend } from '@/services/backend';
import { errorKey } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Segmented';
import { Modal } from '@/components/ui/Modal';
import { useItemLabel } from '@/components/layout/ProfilePage';
import { useAdminText } from './adminText';

const PAGE = 20;
const input = 'h-10 rounded-xl bg-surface px-3 text-sm ring-1 ring-line outline-none focus:ring-primary';

export function AdminPage() {
  const { me, config, refreshMe } = useApp();
  const a = useAdminText();
  const { fmt } = useI18n();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [tab, setTab] = useState<'payments' | 'users'>('payments');
  const [reload, setReload] = useState(0);

  useEffect(() => { if (me?.role === 'admin') backend.admin.summary().then(setSummary).catch(() => setSummary(null)); }, [me?.role, reload]);

  if (me === undefined) return <div className="py-10"><div className="skeleton h-40 rounded-3xl" /></div>;
  if (me?.role !== 'admin') {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <Lock className="mx-auto text-fg-subtle" size={36} />
        <p className="mt-4 font-display text-xl font-bold">{a('forbidden')}</p>
      </div>
    );
  }

  const active = summary?.totals.filter((x) => x.grossMinor > 0) ?? [];
  const shown = active.length ? active : summary?.totals.filter((x) => x.currency === 'USD') ?? [];
  const kpis = summary ? [
    [a('users'), fmt.num(summary.users)], [a('payingUsers'), fmt.num(summary.payingUsers)], [a('pending'), fmt.num(summary.pendingPayments)],
    [a('generations'), fmt.num(summary.generations)], [a('creditsSpent'), fmt.num(summary.creditsSpent)],
  ] : [];

  return (
    <div className="py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{a('title')}</h1>
          <p className="mt-1 text-fg-muted">{a('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {backend.kind === 'demo' ? <Badge tone="accent">{a('demo')}</Badge> : config && <Badge tone="neutral">{a('provider', { p: config.paymentProvider })}</Badge>}
          <Button size="sm" variant="outline" onClick={() => setReload((n) => n + 1)}><RefreshCw size={14} /> {a('refresh')}</Button>
        </div>
      </header>

      {config && !config.paymentsEnabled && (
        <p className="mt-6 flex items-start gap-2 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-fg ring-1 ring-accent/30"><Info size={16} className="mt-0.5 shrink-0" /> {a('providerOff')}</p>
      )}

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={a('net')}>
        {summary ? shown.map((c) => (
          <article key={c.currency} className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-line">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-semibold text-fg-muted">{c.currency}</span>
              <span className="text-xs text-fg-subtle">{a('payments', { n: c.paidCount })}</span>
            </div>
            <p className="mt-2 text-xs text-fg-subtle">{a('net')}</p>
            <p className="font-display text-3xl font-extrabold tabular-nums text-primary-strong">{fmt.money(c.netMinor, c.currency)}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm tabular-nums">
              <div><dt className="text-xs text-fg-subtle">{a('gross')}</dt><dd>{fmt.money(c.grossMinor, c.currency)}</dd></div>
              <div><dt className="text-xs text-fg-subtle">{a('refunded')}</dt><dd>{fmt.money(c.refundedMinor, c.currency)}</dd></div>
            </dl>
          </article>
        )) : <div className="skeleton h-40 rounded-3xl" />}
      </section>
      <p className="mt-3 text-xs text-fg-subtle">{a('payoutNote')}</p>

      {summary && (
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {kpis.map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-surface px-4 py-3 ring-1 ring-line"><dt className="text-xs text-fg-subtle">{k}</dt><dd className="font-display text-xl font-bold tabular-nums">{v}</dd></div>
          ))}
        </dl>
      )}

      <div className="mt-10">
        <Segmented<'payments' | 'users'> label={a('title')} value={tab} onChange={setTab}
          options={[{ value: 'payments', label: a('tabPayments') }, { value: 'users', label: a('tabUsers') }]} />
      </div>
      {tab === 'payments'
        ? <PaymentsTable onChanged={() => { setReload((n) => n + 1); void refreshMe(); }} reload={reload} />
        : <UsersTable reload={reload} onChanged={() => void refreshMe()} />}
    </div>
  );
}

function Pager({ offset, total, onPage }: { offset: number; total: number; onPage: (o: number) => void }) {
  const a = useAdminText();
  if (total <= PAGE) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-fg-muted">
      <span>{a('range', { from: offset + 1, to: Math.min(total, offset + PAGE), total })}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - PAGE))}>{a('prev')}</Button>
        <Button size="sm" variant="outline" disabled={offset + PAGE >= total} onClick={() => onPage(offset + PAGE)}>{a('next')}</Button>
      </div>
    </div>
  );
}

function PaymentsTable({ onChanged, reload }: { onChanged: () => void; reload: number }) {
  const a = useAdminText();
  const { t, fmt } = useI18n();
  const itemLabel = useItemLabel();
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [currency, setCurrency] = useState<Currency | ''>('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ items: PaymentDTO[]; total: number } | null>(null);
  const [confirm, setConfirm] = useState<PaymentDTO | null>(null);
  const [err, setErr] = useState<TKey | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    backend.admin.payments({ status: status || undefined, currency: currency || undefined, q: q || undefined, limit: PAGE, offset })
      .then(setData).catch(() => setData({ items: [], total: 0 }));
  }, [status, currency, q, offset]);
  useEffect(() => { const id = setTimeout(load, q ? 250 : 0); return () => clearTimeout(id); }, [load, q, reload]);

  const refund = async () => {
    if (!confirm) return;
    setBusy(true); setErr(null);
    try { await backend.admin.refund(confirm.id); setConfirm(null); load(); onChanged(); } catch (e) { setErr(errorKey(e)); } finally { setBusy(false); }
  };

  return (
    <section className="mt-4 overflow-hidden rounded-3xl bg-surface shadow-sm ring-1 ring-line">
      <div className="flex flex-wrap gap-2 border-b border-line p-4">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">{a('search')}</span>
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input id="admin-pay-search" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder={a('search')} className={`${input} w-full ps-9`} />
        </label>
        <select id="admin-pay-status" aria-label={a('status')} value={status} onChange={(e) => { setStatus(e.target.value as PaymentStatus | ''); setOffset(0); }} className={input}>
          <option value="">{a('allStatuses')}</option>
          {(['paid', 'pending', 'refunded', 'failed'] as const).map((s) => <option key={s} value={s}>{t(`status.${s}` as TKey)}</option>)}
        </select>
        <select id="admin-pay-currency" aria-label={a('amount')} value={currency} onChange={(e) => { setCurrency(e.target.value as Currency | ''); setOffset(0); }} className={input}>
          <option value="">{a('allCurrencies')}</option>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm tabular-nums">
          <thead className="text-xs text-fg-subtle">
            <tr>{[a('date'), a('customer'), a('item'), a('amount'), a('status'), ''].map((h, i) => <th key={i} className="px-4 py-3 text-start font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data?.items.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="whitespace-nowrap px-4 py-3 text-fg-muted">{fmt.date(p.createdAt)}</td>
                <td className="max-w-[220px] truncate px-4 py-3">{p.userEmail}</td>
                <td className="px-4 py-3">{itemLabel(p.item)}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold">{fmt.money(p.amountMinor, p.currency)}</td>
                <td className="px-4 py-3"><Badge tone={p.status === 'paid' ? 'primary' : p.status === 'refunded' ? 'accent' : 'neutral'}>{t(`status.${p.status}` as TKey)}</Badge></td>
                <td className="px-4 py-3 text-end">
                  {p.status === 'paid' && <Button size="sm" variant="ghost" onClick={() => { setErr(null); setConfirm(p); }}>{a('refund')}</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.items.length && <p className="px-4 py-10 text-center text-fg-muted">{a('noPayments')}</p>}
        {!data && <div className="skeleton m-4 h-24 rounded-2xl" />}
      </div>
      {data && <Pager offset={offset} total={data.total} onPage={setOffset} />}

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={a('refund')} className="max-w-sm">
        {confirm && (
          <div className="p-6">
            <h2 className="pe-8 font-display text-xl font-bold">{a('refund')}</h2>
            <p className="mt-2 text-sm text-fg-muted">{a('refundConfirm', { amount: fmt.money(confirm.amountMinor, confirm.currency), email: confirm.userEmail ?? '', credits: fmt.num(confirm.credits) })}</p>
            {err && <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{t(err)}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirm(null)}>{a('cancel')}</Button>
              <Button onClick={refund} disabled={busy}>{a('confirm')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

function UsersTable({ reload, onChanged }: { reload: number; onChanged: () => void }) {
  const a = useAdminText();
  const { t, fmt } = useI18n();
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ items: AdminUser[]; total: number } | null>(null);
  const [edit, setEdit] = useState<AdminUser | null>(null);
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<TKey | null>(null);

  const load = useCallback(() => {
    backend.admin.users({ q: q || undefined, limit: PAGE, offset }).then(setData).catch(() => setData({ items: [], total: 0 }));
  }, [q, offset]);
  useEffect(() => { const id = setTimeout(load, q ? 250 : 0); return () => clearTimeout(id); }, [load, q, reload]);

  const save = async () => {
    const n = Number(delta.replace('−', '-'));
    if (!edit || !Number.isInteger(n) || n === 0) { setErr('errors.invalid_input'); return; }
    try { await backend.admin.adjustCredits(edit.id, n, note || undefined); setEdit(null); load(); onChanged(); } catch (e) { setErr(errorKey(e)); }
  };

  return (
    <section className="mt-4 overflow-hidden rounded-3xl bg-surface shadow-sm ring-1 ring-line">
      <div className="border-b border-line p-4">
        <label className="relative block">
          <span className="sr-only">{a('search')}</span>
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input id="admin-user-search" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder={a('search')} className={`${input} w-full ps-9`} />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm tabular-nums">
          <thead className="text-xs text-fg-subtle">
            <tr>{[a('customer'), a('plan'), a('credits'), a('joined'), ''].map((h, i) => <th key={i} className="px-4 py-3 text-start font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="max-w-[260px] px-4 py-3">
                  <p className="truncate font-medium">{u.email}</p>
                  {u.role === 'admin' && <Badge tone="accent">admin</Badge>}
                </td>
                <td className="px-4 py-3">{u.planId}</td>
                <td className={`px-4 py-3 font-semibold ${u.balance < 0 ? 'text-danger' : ''}`}>{fmt.num(u.balance)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-fg-muted">{fmt.date(u.createdAt)}</td>
                <td className="px-4 py-3 text-end"><Button size="sm" variant="ghost" onClick={() => { setEdit(u); setDelta(''); setNote(''); setErr(null); }}>{a('adjust')}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.items.length && <p className="px-4 py-10 text-center text-fg-muted">{a('noUsers')}</p>}
      </div>
      {data && <Pager offset={offset} total={data.total} onPage={setOffset} />}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={a('adjust')} className="max-w-sm">
        {edit && (
          <form className="flex flex-col gap-3 p-6" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <h2 className="pe-8 font-display text-lg font-bold">{a('adjustTitle', { email: edit.email })}</h2>
            <label className="text-sm font-medium">{a('delta')}
              <input id="admin-delta" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} className={`${input} mt-1.5 w-full`} placeholder="100 / -50" />
            </label>
            <label className="text-sm font-medium">{a('note')}
              <input id="admin-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={`${input} mt-1.5 w-full`} />
            </label>
            {err && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{t(err)}</p>}
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEdit(null)}>{a('cancel')}</Button>
              <Button type="submit">{a('save')}</Button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}

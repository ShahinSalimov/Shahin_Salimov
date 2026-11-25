import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useDB } from '../lib/store';
import { addDays, fmtDate, money, today } from '../lib/format';
import type { DB } from '../lib/types';
import { Badge, Button, Card, Empty, Input, PageHeader, Stat } from '../components/ui';
import { expenseLabel } from './Cars';
import { bizName } from './Expenses';

export interface Move { dir: 'in' | 'out'; source: string; text: string; amount: number; method: 'cash' | 'card' | '—'; link?: string }

export function cashMoves(db: DB, date: string): Move[] {
  const out: Move[] = [];
  const drivers = new Map(db.drivers.map((d) => [d.id, d]));
  const customers = new Map(db.customers.map((c) => [c.id, c]));
  for (const l of db.ledger) if (l.type === 'payment' && l.date === date) out.push({ dir: 'in', source: bizName(db, 'taxi'), text: drivers.get(l.driverId)?.name ?? 'Sürücü', amount: -l.amount, method: l.method ?? 'cash', link: `#/drivers/${l.driverId}` });
  for (const s of db.sales) if (s.date === date && s.paid > 0) out.push({ dir: 'in', source: bizName(db, 'phone'), text: `Faktura #${s.no} · ${customers.get(s.customerId)?.shop}`, amount: s.paid, method: 'cash', link: '#/sales' });
  for (const p of db.customerPayments) if (p.date === date) out.push({ dir: 'in', source: bizName(db, 'phone'), text: `Borc ödənişi · ${customers.get(p.customerId)?.shop}`, amount: p.amount, method: p.method, link: '#/customers' });
  for (const e of db.entries) if (e.date === date) out.push({ dir: e.kind === 'income' ? 'in' : 'out', source: bizName(db, e.businessId), text: `${e.category}${e.note ? ' · ' + e.note : ''}`, amount: e.amount, method: e.method, link: `#/biz/${e.businessId}` });
  for (const e of db.expenses) if (e.date === date) out.push({ dir: 'out', source: bizName(db, e.business), text: `${expenseLabel[e.category] ?? e.category}${e.note ? ' · ' + e.note : ''}`, amount: e.amount, method: '—', link: '#/expenses' });
  for (const p of db.purchases) if (p.date === date) out.push({ dir: 'out', source: bizName(db, 'phone'), text: `Mal qəbulu · ${p.supplier}`, amount: p.total, method: '—', link: '#/inventory' });
  return out;
}

export default function Cash() {
  const db = useDB();
  const [date, setDate] = useState(today());
  const moves = useMemo(() => cashMoves(db, date), [db, date]);
  const inSum = moves.filter((m) => m.dir === 'in').reduce((s, m) => s + m.amount, 0);
  const outSum = moves.filter((m) => m.dir === 'out').reduce((s, m) => s + m.amount, 0);
  const cash = moves.filter((m) => m.dir === 'in' && m.method === 'cash').reduce((s, m) => s + m.amount, 0);
  const card = moves.filter((m) => m.dir === 'in' && m.method === 'card').reduce((s, m) => s + m.amount, 0);
  const bySource = Object.entries(moves.reduce<Record<string, number>>((a, m) => ((a[m.source] = (a[m.source] ?? 0) + (m.dir === 'in' ? m.amount : -m.amount)), a), {}));

  return (
    <>
      <PageHeader title="Kassa" subtitle={`${fmtDate(date)} — bütün bizneslər üzrə pul hərəkəti`} actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDate(addDays(date, -1))} aria-label="Əvvəlki gün"><ChevronLeft className="size-4" /></Button>
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-44" />
          <Button size="sm" variant="ghost" disabled={date >= today()} onClick={() => setDate(addDays(date, 1))} aria-label="Növbəti gün"><ChevronRight className="size-4" /></Button>
        </div>
      } />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Mədaxil" value={money(inSum)} tone="green" icon={<ArrowDownLeft className="size-5" />} />
        <Stat label="Məxaric" value={money(outSum)} tone="red" icon={<ArrowUpRight className="size-5" />} />
        <Stat label="Nağd / kart" value={`${money(cash)}`} sub={`kart: ${money(card)}`} />
        <Stat label="Günün nəticəsi" value={money(inSum - outSum)} tone="brand" />
      </div>
      {bySource.length > 0 && (
        <Card className="mb-4 flex flex-wrap gap-x-8 gap-y-2 p-4">
          {bySource.map(([k, v]) => <div key={k}><div className="text-xs text-slate-500">{k}</div><div className={`tabular font-semibold ${v < 0 ? 'text-rose-600' : ''}`}>{money(v)}</div></div>)}
        </Card>
      )}
      <Card className="overflow-hidden">
        {moves.length === 0 ? <Empty text="Bu gün üçün hərəkət yoxdur" /> : moves.map((m, i) => (
          <a key={i} href={m.link} className="flex items-center justify-between gap-3 border-b border-slate-50 px-4 py-2.5 text-sm last:border-0 hover:bg-slate-50">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`grid size-8 shrink-0 place-items-center rounded-full ${m.dir === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{m.dir === 'in' ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</span>
              <div className="min-w-0"><div className="truncate">{m.text}</div><div className="flex gap-1.5 text-xs text-slate-400"><span>{m.source}</span>{m.method !== '—' && <Badge>{m.method === 'cash' ? 'nağd' : 'kart'}</Badge>}</div></div>
            </div>
            <div className={`tabular font-semibold ${m.dir === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>{m.dir === 'in' ? '+' : '−'}{money(m.amount)}</div>
          </a>
        ))}
      </Card>
    </>
  );
}

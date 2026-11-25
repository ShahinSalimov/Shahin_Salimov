import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { update, useDB } from '../lib/store';
import { fmtDate, money, monthKey, monthName, today, uid } from '../lib/format';
import type { DB, Expense } from '../lib/types';
import { Badge, Button, Card, DataList, Field, Input, Modal, PageHeader, Select, Tabs, toast } from '../components/ui';
import { expenseLabel } from './Cars';

export const bizName = (db: DB, id: string) => db.businesses.find((b) => b.id === id)?.name ?? id;
const catName = (c: string) => expenseLabel[c] ?? c;

export default function Expenses() {
  const db = useDB();
  const [tab, setTab] = useState<string>('all');
  const [month, setMonth] = useState(monthKey(today()));
  const [edit, setEdit] = useState<Expense | 'new' | null>(null);
  const cars = new Map(db.cars.map((c) => [c.id, c]));
  const months = [...new Set(db.expenses.map((e) => monthKey(e.date)).concat(monthKey(today())))].sort().reverse();
  const inMonth = db.expenses.filter((e) => monthKey(e.date) === month);
  const rows = inMonth.filter((e) => tab === 'all' || e.business === tab).sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.reduce((s, e) => s + e.amount, 0);
  const byCat = Object.entries(rows.reduce<Record<string, number>>((m, e) => ((m[e.category] = (m[e.category] ?? 0) + e.amount), m), {})).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader title="Xərclər və servis" subtitle={`${monthName(month)}: ${money(total)}`} actions={<>
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-40">{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</Select>
        <Button variant="primary" onClick={() => setEdit('new')}><Plus className="size-4" /> Xərc əlavə et</Button>
      </>} />
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'all', label: 'Hamısı', count: inMonth.length },
        ...db.businesses.filter((b) => b.builtin).map((b) => ({ value: b.id, label: b.name, count: inMonth.filter((e) => e.business === b.id).length })),
      ]} />
      {byCat.length > 0 && (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {byCat.map(([k, v]) => <div key={k}><div className="text-xs text-slate-500">{catName(k)}</div><div className="tabular font-semibold">{money(v)}</div></div>)}
          </div>
        </Card>
      )}
      <DataList
        rows={rows}
        onRow={setEdit}
        columns={[
          { head: 'Tarix', cell: (e) => fmtDate(e.date) },
          { head: 'Kateqoriya', cell: (e) => <div className="flex gap-1.5"><Badge>{catName(e.category)}</Badge><Badge tone="blue">{bizName(db, e.business)}</Badge></div> },
          { head: 'Maşın', cell: (e) => (e.carId ? <span className="font-mono">{cars.get(e.carId)?.plate}</span> : '—') },
          { head: 'Qeyd', cell: (e) => <span className="text-slate-500">{e.note ?? ''}</span> },
          { head: 'Məbləğ', cell: (e) => <span className="tabular font-semibold">{money(e.amount)}</span>, className: 'text-right' },
          { head: '', cell: () => <Pencil className="size-4 text-slate-300" /> },
        ]}
        mobile={(e) => (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex gap-1.5"><Badge>{catName(e.category)}</Badge>{e.carId && <span className="font-mono text-sm">{cars.get(e.carId)?.plate}</span>}</div>
              <div className="mt-1 text-xs text-slate-500">{fmtDate(e.date)} · {bizName(db, e.business)}{e.note ? ` · ${e.note}` : ''}</div>
            </div>
            <div className="tabular font-bold">{money(e.amount)}</div>
          </div>
        )}
      />
      {edit && <ExpenseForm expense={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ExpenseForm({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const db = useDB();
  const [f, setF] = useState<Expense>(expense ?? { id: uid(), date: today(), business: 'taxi', category: 'repair', amount: 0 });
  const set = <K extends keyof Expense>(k: K, v: Expense[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () => {
    if (!f.amount) return toast('Məbləğ daxil edin');
    const rec = { ...f, carId: f.business === 'taxi' ? f.carId : undefined };
    update(`${expense ? 'Xərc redaktə edildi' : 'Xərc'}: ${catName(f.category)} ${money(f.amount)}`, (d) => ({ ...d, expenses: expense ? d.expenses.map((x) => (x.id === f.id ? rec : x)) : [...d.expenses, rec] }));
    toast('Yadda saxlanıldı');
    onClose();
  };
  const remove = () => {
    if (!expense || !confirm('Xərc silinsin?')) return;
    update(`Xərc silindi: ${catName(expense.category)} ${money(expense.amount)}`, (d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== expense.id) }));
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={expense ? 'Xərci redaktə et' : 'Yeni xərc'} footer={<>{expense && <Button variant="ghost" className="text-rose-600" onClick={remove}>Sil</Button>}<Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Yadda saxla</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Biznes"><Select value={f.business} onChange={(e) => set('business', e.target.value)}>{db.businesses.filter((b) => b.builtin).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <Field label="Kateqoriya"><Select value={f.category} onChange={(e) => set('category', e.target.value)}>{Object.entries(expenseLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        {f.business === 'taxi' && (
          <div className="md:col-span-2"><Field label="Avtomobil (istəyə bağlı)"><Select value={f.carId ?? ''} onChange={(e) => set('carId', e.target.value || undefined)}><option value="">—</option>{[...db.cars].sort((a, b) => a.plate.localeCompare(b.plate)).map((c) => <option key={c.id} value={c.id}>{c.plate} · {c.make} {c.model}</option>)}</Select></Field></div>
        )}
        <Field label="Məbləğ (₼)"><Input type="number" inputMode="decimal" value={f.amount || ''} onChange={(e) => set('amount', Number(e.target.value))} /></Field>
        <Field label="Tarix"><Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <div className="md:col-span-2"><Field label="Qeyd"><Input value={f.note ?? ''} onChange={(e) => set('note', e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

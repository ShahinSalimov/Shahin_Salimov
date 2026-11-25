import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { Download } from 'lucide-react';
import { useDB } from '../lib/store';
import { saleProfit } from '../lib/calc';
import { money, monthKey, monthName, today } from '../lib/format';
import { Button, Card, PageHeader, Select } from '../components/ui';
import { productName } from './Inventory';

function csv(name: string, rows: (string | number)[][]) {
  const text = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
}

export default function Reports() {
  const db = useDB();
  const months = [...new Set([...db.ledger.map((l) => monthKey(l.date)), ...db.sales.map((s) => monthKey(s.date)), monthKey(today())])].sort().reverse();
  const [month, setMonth] = useState(monthKey(today()));

  const r = useMemo(() => {
    const inM = (d: string) => monthKey(d) === month;
    const taxiIncome = db.ledger.filter((l) => l.type === 'payment' && inM(l.date)).reduce((s, l) => s - l.amount, 0);
    const sales = db.sales.filter((s) => inM(s.date));
    const phoneRevenue = sales.reduce((s, x) => s + x.total, 0);
    const phoneProfit = sales.reduce((s, x) => s + saleProfit(x), 0);
    const exp = (b: string) => db.expenses.filter((e) => e.business === b && inM(e.date)).reduce((s, e) => s + e.amount, 0);
    const lines = [
      { name: db.businesses.find((b) => b.id === 'taxi')?.name ?? 'Taksi', income: taxiIncome, cost: exp('taxi'), color: '#eab308' },
      { name: db.businesses.find((b) => b.id === 'phone')?.name ?? 'Telefon', income: phoneProfit, cost: exp('phone'), color: '#0ea5e9', note: `dövriyyə ${money(phoneRevenue)}` },
      ...db.businesses.filter((b) => !b.builtin).map((b) => {
        const es = db.entries.filter((e) => e.businessId === b.id && inM(e.date));
        return { name: b.name, income: es.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount, 0), cost: es.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0), color: b.color };
      }),
      { name: 'Ümumi xərclər', income: 0, cost: exp('general'), color: '#64748b' },
    ];
    // avtomobil mənfəəti — seçilmiş ay
    const inc = new Map<string, number>();
    const cost = new Map<string, number>();
    for (const l of db.ledger) if (l.type === 'payment' && l.carId && inM(l.date)) inc.set(l.carId, (inc.get(l.carId) ?? 0) - l.amount);
    for (const e of db.expenses) if (e.carId && inM(e.date)) cost.set(e.carId, (cost.get(e.carId) ?? 0) + e.amount);
    const cars = db.cars.map((c) => ({ car: c, income: inc.get(c.id) ?? 0, cost: cost.get(c.id) ?? 0, profit: (inc.get(c.id) ?? 0) - (cost.get(c.id) ?? 0) })).sort((a, b) => b.profit - a.profit);
    const prod = new Map<string, { qty: number; profit: number }>();
    for (const s of sales) for (const i of s.items) { const p = prod.get(i.productId) ?? { qty: 0, profit: 0 }; p.qty += i.qty; p.profit += (i.price - i.cost) * i.qty; prod.set(i.productId, p); }
    const products = [...prod.entries()].map(([id, v]) => ({ p: db.products.find((x) => x.id === id), ...v })).filter((x) => x.p).sort((a, b) => b.profit - a.profit).slice(0, 8);
    const cust = new Map<string, number>();
    for (const s of sales) cust.set(s.customerId, (cust.get(s.customerId) ?? 0) + s.total);
    const customers = [...cust.entries()].map(([id, v]) => ({ c: db.customers.find((x) => x.id === id), v })).sort((a, b) => b.v - a.v).slice(0, 8);
    return { lines, cars, products, customers };
  }, [db, month]);

  const net = r.lines.reduce((s, l) => s + l.income - l.cost, 0);

  return (
    <>
      <PageHeader title="Hesabatlar" subtitle={monthName(month)} actions={<>
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-40">{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</Select>
        <Button onClick={() => csv(`avtomobil-menfeeti-${month}.csv`, [['Nömrə', 'Model', 'Gəlir', 'Xərc', 'Mənfəət'], ...r.cars.map((x) => [x.car.plate, `${x.car.make} ${x.car.model}`, x.income, x.cost, x.profit])])}><Download className="size-4" /> Excel (CSV)</Button>
      </>} />

      <Card className="p-4 md:p-5">
        <div className="mb-1 font-semibold">Mənfəət və zərər (bizneslər üzrə)</div>
        <div className="mb-4 text-xs text-slate-500">Telefon üçün brüt mənfəət (satış − maya) götürülür</div>
        <div className="space-y-3">
          {r.lines.map((l) => (
            <div key={l.name} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex min-w-0 items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: l.color }} /><span className="truncate font-medium">{l.name}</span>{'note' in l && l.note && <span className="hidden text-xs text-slate-400 md:inline">({l.note})</span>}</div>
              <div className="flex gap-4 text-right md:gap-8">
                <span className="tabular hidden w-24 text-emerald-600 md:inline">{l.income ? money(l.income) : '—'}</span>
                <span className="tabular hidden w-24 text-rose-600 md:inline">{l.cost ? money(-l.cost) : '—'}</span>
                <span className={`tabular w-24 font-semibold ${l.income - l.cost < 0 ? 'text-rose-600' : ''}`}>{money(l.income - l.cost)}</span>
              </div>
            </div>
          ))}
          <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold"><span>Xalis nəticə</span><span className="tabular">{money(net)}</span></div>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4 md:p-5">
          <div className="mb-3 font-semibold">Ən gəlirli 10 avtomobil</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.cars.slice(0, 10).map((x) => ({ name: x.car.plate, v: x.profit }))} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fontFamily: 'monospace' }} />
                <Tooltip formatter={(v: number) => [money(v), 'Mənfəət']} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar isAnimationActive={false} dataKey="v" radius={[0, 6, 6, 0]} fill="#eab308" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4 md:p-5">
          <div className="mb-3 font-semibold">Ən az gəlirli avtomobillər</div>
          <div className="text-xs text-slate-500">Bu maşınlar ya çox xərc aparır, ya da boş dayanır</div>
          <div className="mt-2">
            {r.cars.slice(-8).reverse().map((x) => (
              <a key={x.car.id} href={`#/cars/${x.car.id}`} className="flex justify-between border-b border-slate-50 py-2 text-sm last:border-0 hover:bg-slate-50">
                <span><span className="font-mono font-semibold">{x.car.plate}</span> <span className="text-slate-400">· {x.car.make} {x.car.model}</span></span>
                <span className={`tabular font-semibold ${x.profit < 0 ? 'text-rose-600' : ''}`}>{money(x.profit)}</span>
              </a>
            ))}
          </div>
        </Card>
        <Card className="p-4 md:p-5">
          <div className="mb-3 font-semibold">Ən çox qazandıran məhsullar</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.products.map((x) => ({ name: x.p!.model, v: Math.round(x.profit) }))} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [money(v), 'Mənfəət']} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar isAnimationActive={false} dataKey="v" radius={[6, 6, 0, 0]}>{r.products.map((_, i) => <Cell key={i} fill={i === 0 ? '#059669' : '#34d399'} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1 text-xs text-slate-500">{r.products.slice(0, 3).map((x) => <div key={x.p!.id}>{productName(x.p!)} — {x.qty} ədəd</div>)}</div>
        </Card>
        <Card className="p-4 md:p-5">
          <div className="mb-3 font-semibold">Ən böyük müştərilər</div>
          {r.customers.map((x, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-slate-50 py-2 text-sm last:border-0">
              <span className="grid size-6 place-items-center rounded-full bg-slate-100 text-xs font-semibold">{i + 1}</span>
              <span className="flex-1 truncate">{x.c?.shop}</span>
              <span className="tabular font-semibold">{money(x.v)}</span>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

import { useMemo, useState } from 'react';
import { Banknote, CreditCard, MessageCircle, Undo2, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { update, useDB } from '../lib/store';
import { currentAssignments, driverBalances, waLink } from '../lib/calc';
import { addDays, fmtDate, money, today, uid } from '../lib/format';
import type { Car, Driver, PayMethod } from '../lib/types';
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, SearchBox, Select, Tabs, toast } from '../components/ui';

type Filter = 'all' | 'unpaid' | 'paid' | 'debt';

export function recordPayment(driver: Driver, car: Car | undefined, amount: number, method: PayMethod, date: string, note?: string) {
  update(`Ödəniş qəbul edildi: ${driver.name} — ${money(amount)} (${method === 'cash' ? 'nağd' : 'kart'})`, (db) => ({
    ...db,
    ledger: [...db.ledger, { id: uid(), driverId: driver.id, carId: car?.id, date, type: 'payment', amount: -amount, method, note }],
  }));
}

export default function Payments() {
  const db = useDB();
  const [date, setDate] = useState(today());
  const [filter, setFilter] = useState<Filter>('unpaid');
  const [q, setQ] = useState('');
  const [custom, setCustom] = useState<{ driver: Driver; car?: Car } | null>(null);

  const rows = useMemo(() => {
    const { byDriver } = currentAssignments(db);
    const bal = driverBalances(db);
    const carMap = new Map(db.cars.map((c) => [c.id, c]));
    const paid = new Map<string, number>();
    for (const l of db.ledger) if (l.type === 'payment' && l.date === date) paid.set(l.driverId, (paid.get(l.driverId) ?? 0) - l.amount);
    return db.drivers
      .filter((d) => d.active && byDriver.has(d.id))
      .map((d) => {
        const car = carMap.get(byDriver.get(d.id)!);
        return { d, car, paid: paid.get(d.id) ?? 0, balance: bal.get(d.id) ?? 0, rate: car?.dailyRate ?? 0 };
      })
      .sort((a, b) => b.balance - a.balance);
  }, [db, date]);

  const counts = {
    all: rows.length,
    unpaid: rows.filter((r) => r.paid < r.rate).length,
    paid: rows.filter((r) => r.paid >= r.rate).length,
    debt: rows.filter((r) => r.balance > 0).length,
  };
  const total = rows.reduce((s, r) => s + r.paid, 0);
  const expected = rows.reduce((s, r) => s + r.rate, 0);

  const shown = rows.filter((r) => {
    if (filter === 'unpaid' && r.paid >= r.rate) return false;
    if (filter === 'paid' && r.paid < r.rate) return false;
    if (filter === 'debt' && r.balance <= 0) return false;
    if (q) {
      const s = q.toLowerCase();
      return r.d.name.toLowerCase().includes(s) || r.car?.plate.toLowerCase().includes(s) || r.d.phone.includes(s);
    }
    return true;
  });

  const undo = (d: Driver) => {
    const entries = db.ledger.filter((l) => l.driverId === d.id && l.type === 'payment' && l.date === date);
    const last = entries[entries.length - 1];
    if (!last) return;
    update(`Ödəniş ləğv edildi: ${d.name} — ${money(-last.amount)}`, (x) => ({ ...x, ledger: x.ledger.filter((l) => l.id !== last.id) }));
    toast('Ödəniş ləğv edildi');
  };

  return (
    <>
      <PageHeader title="Gündəlik ödəniş" subtitle="Bir toxunuşla ödəniş qəbul edin" />

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDate(addDays(date, -1))} aria-label="Əvvəlki gün"><ChevronLeft className="size-4" /></Button>
            <Input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-44" />
            <Button size="sm" variant="ghost" disabled={date >= today()} onClick={() => setDate(addDays(date, 1))} aria-label="Növbəti gün"><ChevronRight className="size-4" /></Button>
          </div>
          <div className="flex gap-6">
            <div><div className="text-xs text-slate-500">Yığılan</div><div className="tabular text-xl font-bold text-emerald-600">{money(total)}</div></div>
            <div><div className="text-xs text-slate-500">Gözlənilən</div><div className="tabular text-xl font-bold">{money(expected)}</div></div>
            <div><div className="text-xs text-slate-500">Qalıq</div><div className="tabular text-xl font-bold text-rose-600">{money(Math.max(0, expected - total))}</div></div>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={filter} onChange={setFilter} items={[
          { value: 'unpaid', label: 'Ödəməyib', count: counts.unpaid },
          { value: 'paid', label: 'Ödəyib', count: counts.paid },
          { value: 'debt', label: 'Borclu', count: counts.debt },
          { value: 'all', label: 'Hamısı', count: counts.all },
        ]} />
        <div className="mb-4"><SearchBox value={q} onChange={setQ} placeholder="Ad, nömrə, telefon..." /></div>
      </div>

      {shown.length === 0 ? (
        <Card><Empty text={filter === 'unpaid' ? 'Bu gün hamı ödəyib' : 'Nəticə yoxdur'} /></Card>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {shown.map(({ d, car, paid, balance, rate }) => {
            const done = paid >= rate;
            const msg = `Salam ${d.name.split(' ')[0]}, ${db.settings.companyName}. ${fmtDate(date)} üçün icarə: ${money(rate)}.${balance > 0 ? ` Ümumi borcunuz: ${money(balance)}.` : ''} Zəhmət olmasa ödənişi edin.`;
            return (
              <Card key={d.id} className={`p-3.5 ${done ? 'bg-emerald-50/40' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <a href={`#/drivers/${d.id}`} className="min-w-0">
                    <div className="truncate font-semibold">{d.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-700">{car?.plate}</span>
                      <span>{money(rate)}/gün</span>
                    </div>
                  </a>
                  <div className="text-right">
                    {done ? <Badge tone="green">Ödəyib {money(paid)}</Badge> : paid > 0 ? <Badge tone="amber">Qismən {money(paid)}</Badge> : <Badge tone="slate">Gözlənilir</Badge>}
                    <div className={`tabular mt-1 text-xs ${balance > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{balance > 0 ? `Borc ${money(balance)}` : balance < 0 ? `Avans ${money(-balance)}` : 'Borc yoxdur'}</div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {!done ? (
                    <>
                      <Button variant="success" className="flex-1" onClick={() => { recordPayment(d, car, rate - paid, 'cash', date); toast(`${d.name}: ${money(rate - paid)} nağd`); }}>
                        <Banknote className="size-4" /> Nağd
                      </Button>
                      <Button variant="dark" className="flex-1" onClick={() => { recordPayment(d, car, rate - paid, 'card', date); toast(`${d.name}: ${money(rate - paid)} kart`); }}>
                        <CreditCard className="size-4" /> Kart
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" className="flex-1" onClick={() => undo(d)}><Undo2 className="size-4" /> Ləğv et</Button>
                  )}
                  <Button variant="secondary" onClick={() => setCustom({ driver: d, car })} aria-label="Başqa məbləğ"><Pencil className="size-4" /></Button>
                  <a href={waLink(d.phone, msg)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-emerald-700" aria-label="WhatsApp xatırlatma">
                    <MessageCircle className="size-4" />
                  </a>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {custom && <CustomPayment {...custom} date={date} balance={rows.find((r) => r.d.id === custom.driver.id)?.balance ?? 0} onClose={() => setCustom(null)} />}
    </>
  );
}

export function CustomPayment({ driver, car, date, balance, onClose }: { driver: Driver; car?: Car; date: string; balance: number; onClose: () => void }) {
  const [amount, setAmount] = useState(String(Math.max(car?.dailyRate ?? 0, Math.round(balance)) || ''));
  const [method, setMethod] = useState<PayMethod>('cash');
  const [note, setNote] = useState('');
  const save = () => {
    const v = Number(amount);
    if (!v || v <= 0) return toast('Məbləğ daxil edin');
    recordPayment(driver, car, v, method, date, note || undefined);
    toast(`${driver.name}: ${money(v)} qəbul edildi`);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Ödəniş — ${driver.name}`} footer={<><Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Qəbul et</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          Cari borc: <b className={balance > 0 ? 'text-rose-600' : ''}>{money(balance)}</b>
          {car && <> · Gündəlik: <b>{money(car.dailyRate)}</b></>}
        </div>
        <Field label="Məbləğ (₼)"><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <div className="flex flex-wrap gap-2">
          {[car?.dailyRate ?? 45, (car?.dailyRate ?? 45) * 2, Math.round(balance)].filter((x, i, a) => x > 0 && a.indexOf(x) === i).map((x) => (
            <Button key={x} size="sm" onClick={() => setAmount(String(x))}>{money(x)}</Button>
          ))}
        </div>
        <Field label="Ödəniş üsulu">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
            <option value="cash">Nağd</option>
            <option value="card">Kart / köçürmə</option>
          </Select>
        </Field>
        <Field label="Qeyd"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="məs. borcun bir hissəsi" /></Field>
      </div>
    </Modal>
  );
}

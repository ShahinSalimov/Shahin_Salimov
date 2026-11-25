import { useMemo, useState } from 'react';
import { Plus, ArrowLeft, Pencil, MessageCircle, Phone, Wallet, FilePlus2, Car as CarIcon, Printer } from 'lucide-react';
import { update, useDB } from '../lib/store';
import { currentAssignments, driverBalances, driverRatings, ratingLabel, waLink, type Rating } from '../lib/calc';
import { fmtDate, money, today, uid } from '../lib/format';
import type { Driver, LedgerEntry, LedgerType, PayMethod } from '../lib/types';
import { Badge, Button, Card, DataList, Empty, Field, Input, Modal, PageHeader, SearchBox, Select, Tabs, toast, ask, canPrint } from '../components/ui';
import { CustomPayment } from './Payments';
import { AssignModal } from './Cars';

const ratingTone: Record<Rating, 'gold' | 'slate' | 'red' | 'blue'> = { gold: 'gold', silver: 'slate', red: 'red', new: 'blue' };
const ledgerLabel: Record<LedgerType, string> = { rent: 'İcarə', payment: 'Ödəniş', fine: 'Cərimə', damage: 'Zərər', deposit: 'Depozitdən', adjust: 'Düzəliş' };

export function RatingBadge({ r }: { r: Rating }) {
  return <Badge tone={ratingTone[r]}>{ratingLabel[r]}</Badge>;
}

export default function Drivers({ query }: { query: URLSearchParams }) {
  const db = useDB();
  const [tab, setTab] = useState<'active' | 'debt' | 'red' | 'inactive'>(query.get('f') === 'debt' ? 'debt' : 'active');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Driver | 'new' | null>(null);

  const data = useMemo(() => {
    const bal = driverBalances(db);
    const rat = driverRatings(db);
    const { byDriver } = currentAssignments(db);
    const cars = new Map(db.cars.map((c) => [c.id, c]));
    return db.drivers.map((d) => ({ d, balance: bal.get(d.id) ?? 0, rating: rat.get(d.id)!, car: cars.get(byDriver.get(d.id) ?? '') }));
  }, [db]);

  const rows = data
    .filter((r) => {
      if (tab === 'active' && !r.d.active) return false;
      if (tab === 'inactive' && r.d.active) return false;
      if (tab === 'debt' && !(r.d.active && r.balance > 0)) return false;
      if (tab === 'red' && !(r.d.active && r.rating.rating === 'red')) return false;
      if (!q) return true;
      const s = q.toLowerCase();
      return r.d.name.toLowerCase().includes(s) || r.d.phone.includes(s) || (r.car?.plate.toLowerCase().includes(s) ?? false);
    })
    .sort((a, b) => (tab === 'debt' ? b.balance - a.balance : a.d.name.localeCompare(b.d.name)));

  const totalDebt = data.filter((r) => r.d.active).reduce((s, r) => s + Math.max(0, r.balance), 0);

  return (
    <>
      <PageHeader title="Sürücülər" subtitle={`Ümumi borc: ${money(totalDebt)}`} actions={<Button variant="primary" onClick={() => setEdit('new')}><Plus className="size-4" /> Yeni sürücü</Button>} />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={tab} onChange={setTab} items={[
          { value: 'active', label: 'Aktiv', count: data.filter((r) => r.d.active).length },
          { value: 'debt', label: 'Borclular', count: data.filter((r) => r.d.active && r.balance > 0).length },
          { value: 'red', label: 'Riskli', count: data.filter((r) => r.d.active && r.rating.rating === 'red').length },
          { value: 'inactive', label: 'Passiv', count: data.filter((r) => !r.d.active).length },
        ]} />
        <div className="mb-4"><SearchBox value={q} onChange={setQ} placeholder="Ad, telefon, nömrə..." /></div>
      </div>
      <DataList
        rows={rows}
        onRow={(r) => (location.hash = `#/drivers/${r.d.id}`)}
        columns={[
          { head: 'Sürücü', cell: (r) => <div><div className="font-medium">{r.d.name}</div><div className="text-xs text-slate-400">{r.d.phone}</div></div> },
          { head: 'Maşın', cell: (r) => r.car ? <span className="font-mono font-semibold">{r.car.plate}</span> : <span className="text-slate-400">—</span> },
          { head: 'Reytinq', cell: (r) => <div className="flex items-center gap-2"><RatingBadge r={r.rating.rating} />{r.rating.rating !== 'new' && <span className="tabular text-xs text-slate-400">{Math.round(r.rating.ratio * 100)}%</span>}</div> },
          { head: 'Depozit', cell: (r) => <span className="tabular">{money(r.d.deposit)}</span>, className: 'text-right' },
          { head: 'Balans', cell: (r) => <span className={`tabular font-semibold ${r.balance > r.d.debtLimit ? 'text-rose-600' : r.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{r.balance > 0 ? money(r.balance) : r.balance < 0 ? `+${money(-r.balance)}` : '0 ₼'}</span>, className: 'text-right' },
        ]}
        mobile={(r) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className="truncate font-semibold">{r.d.name}</span><RatingBadge r={r.rating.rating} /></div>
              <div className="mt-0.5 text-sm text-slate-500">{r.car ? <span className="font-mono">{r.car.plate}</span> : 'maşın yoxdur'} · {r.d.phone}</div>
            </div>
            <div className={`tabular text-right font-bold ${r.balance > r.d.debtLimit ? 'text-rose-600' : r.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{r.balance > 0 ? money(r.balance) : '0 ₼'}</div>
          </div>
        )}
      />
      {edit && <DriverForm driver={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

export function DriverDetail({ id }: { id: string }) {
  const db = useDB();
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(false);
  const [charge, setCharge] = useState(false);
  const [assign, setAssign] = useState(false);
  const [entry, setEntry] = useState<LedgerEntry | null>(null);
  const d = db.drivers.find((x) => x.id === id);
  const ledger = useMemo(() => {
    const rows = db.ledger.filter((l) => l.driverId === id).sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'rent' ? -1 : 1));
    let run = 0;
    return rows.map((l) => ({ l, run: (run += l.amount) })).reverse();
  }, [db, id]);
  if (!d) return <Empty text="Sürücü tapılmadı" />;
  const balance = driverBalances(db).get(d.id) ?? 0;
  const rating = driverRatings(db).get(d.id)!;
  const { byDriver } = currentAssignments(db);
  const car = db.cars.find((c) => c.id === byDriver.get(d.id));
  const finesCount = db.fines.filter((f) => f.driverId === d.id).length;
  const msg = `Salam ${d.name.split(' ')[0]}, ${db.settings.companyName}. ${fmtDate(today())} tarixinə borcunuz: ${money(Math.max(0, balance))}. Zəhmət olmasa ödənişi edin.`;

  const useDeposit = async () => {
    const amt = Math.min(d.deposit, Math.max(0, balance));
    if (amt <= 0) return toast('Depozitdən çıxılacaq borc yoxdur');
    if (!await ask(`Depozitdən ${money(amt)} borca silinsin?`)) return;
    update(`${d.name} — depozitdən ${money(amt)} borca silindi`, (x) => ({
      ...x,
      drivers: x.drivers.map((y) => (y.id === d.id ? { ...y, deposit: y.deposit - amt } : y)),
      ledger: [...x.ledger, { id: uid(), driverId: d.id, carId: car?.id, date: today(), type: 'deposit', amount: -amt, note: 'Depozitdən silindi' }],
    }));
  };

  return (
    <>
      <a href="#/drivers" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink no-print"><ArrowLeft className="size-4" /> Sürücülər</a>
      <PageHeader
        title={d.name}
        subtitle={`${d.phone} · vəsiqə ${d.licenseNo} · ${fmtDate(d.startDate)}-dən`}
        actions={<div className="no-print flex flex-wrap gap-2">
          <a href={`tel:${d.phone}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm"><Phone className="size-4" /> Zəng</a>
          <a href={waLink(d.phone, msg)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm text-emerald-700"><MessageCircle className="size-4" /> WhatsApp</a>
          {canPrint && <Button onClick={() => window.print()}><Printer className="size-4" /> Çap</Button>}
          <Button onClick={() => setEdit(true)}><Pencil className="size-4" /> Redaktə</Button>
        </div>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className={`p-4 ${balance > d.debtLimit ? 'border-rose-200 bg-rose-50' : ''}`}><div className="text-xs text-slate-500">Balans</div><div className={`tabular mt-1 text-2xl font-bold ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{balance > 0 ? money(balance) : balance < 0 ? `+${money(-balance)}` : '0 ₼'}</div><div className="text-xs text-slate-500">{balance > 0 ? 'borc' : balance < 0 ? 'avans' : 'hesab bağlıdır'} · limit {money(d.debtLimit)}</div></Card>
        <Card className="p-4"><div className="text-xs text-slate-500">Depozit</div><div className="tabular mt-1 text-2xl font-bold">{money(d.deposit)}</div><button className="no-print text-xs font-medium text-sky-600" onClick={useDeposit}>Borca sil</button></Card>
        <Card className="p-4"><div className="text-xs text-slate-500">Reytinq (30 gün)</div><div className="mt-1.5"><RatingBadge r={rating.rating} /></div><div className="mt-1 text-xs text-slate-500">{rating.rating === 'new' ? 'kifayət qədər tarixçə yoxdur' : `ödəniş intizamı ${Math.round(rating.ratio * 100)}%`}</div></Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">Maşın</div>
          {car ? <a href={`#/cars/${car.id}`} className="mt-1 block"><div className="font-mono text-lg font-bold">{car.plate}</div><div className="text-xs text-slate-500">{car.make} {car.model} · {money(car.dailyRate)}/gün</div></a>
            : <Button size="sm" variant="primary" className="no-print mt-2" onClick={() => setAssign(true)}><CarIcon className="size-4" /> Təyin et</Button>}
        </Card>
      </div>

      <div className="no-print mt-4 flex gap-2">
        <Button variant="success" className="flex-1 md:flex-none" onClick={() => setPay(true)}><Wallet className="size-4" /> Ödəniş qəbul et</Button>
        <Button className="flex-1 md:flex-none" onClick={() => setCharge(true)}><FilePlus2 className="size-4" /> Borc əlavə et</Button>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="font-semibold">Hesab çıxarışı</div>
          <div className="text-xs text-slate-500">{ledger.length} əməliyyat · {finesCount} cərimə</div>
        </div>
        {ledger.length === 0 ? <Empty text="Əməliyyat yoxdur" /> : (
          <div className="max-h-[480px] overflow-y-auto">
            {ledger.slice(0, 200).map(({ l, run }) => (
              <button key={l.id} onClick={() => setEntry(l)} className="flex w-full items-center justify-between gap-3 border-b border-slate-50 px-4 py-2.5 text-left text-sm last:border-0 hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={l.amount < 0 ? 'green' : l.type === 'rent' ? 'slate' : 'red'}>{ledgerLabel[l.type]}</Badge>
                    {l.method && <span className="text-xs text-slate-400">{l.method === 'cash' ? 'nağd' : 'kart'}</span>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">{fmtDate(l.date)}{l.note ? ` · ${l.note}` : ''}</div>
                </div>
                <div className="text-right">
                  <div className={`tabular font-semibold ${l.amount < 0 ? 'text-emerald-600' : ''}`}>{l.amount < 0 ? `+${money(-l.amount)}` : `−${money(l.amount)}`}</div>
                  <div className="tabular text-xs text-slate-400">qalıq {money(run)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {edit && <DriverForm driver={d} onClose={() => setEdit(false)} />}
      {pay && <CustomPayment driver={d} car={car} date={today()} balance={balance} onClose={() => setPay(false)} />}
      {charge && <ChargeModal driver={d} carId={car?.id} onClose={() => setCharge(false)} />}
      {assign && <AssignModal driverId={d.id} onClose={() => setAssign(false)} />}
      {entry && <EntryEdit entry={entry} onClose={() => setEntry(null)} />}
    </>
  );
}

function EntryEdit({ entry, onClose }: { entry: LedgerEntry; onClose: () => void }) {
  const isPay = entry.amount < 0;
  const [amount, setAmount] = useState(String(Math.abs(entry.amount)));
  const [date, setDate] = useState(entry.date);
  const [note, setNote] = useState(entry.note ?? '');
  const [method, setMethod] = useState<PayMethod>(entry.method ?? 'cash');
  const linked = entry.type === 'fine' && entry.refId;
  const save = () => {
    const v = Number(amount);
    if (!v) return toast('Məbləğ daxil edin');
    const rec: LedgerEntry = { ...entry, amount: isPay ? -v : v, date, note: note || undefined, method: entry.type === 'payment' ? method : entry.method };
    update(`Hesab qeydi redaktə edildi: ${ledgerLabel[entry.type]} ${money(Math.abs(entry.amount))} → ${money(v)}`, (d) => ({ ...d, ledger: d.ledger.map((l) => (l.id === entry.id ? rec : l)) }));
    toast('Yadda saxlanıldı');
    onClose();
  };
  const remove = async () => {
    if (!await ask(`${ledgerLabel[entry.type]} qeydi silinsin?`)) return;
    update(`Hesab qeydi silindi: ${ledgerLabel[entry.type]} ${money(Math.abs(entry.amount))} (${fmtDate(entry.date)})`, (d) => ({
      ...d,
      ledger: d.ledger.filter((l) => l.id !== entry.id),
      fines: linked ? d.fines.map((f) => (f.id === entry.refId ? { ...f, chargedToDriver: false } : f)) : d.fines,
    }));
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`${ledgerLabel[entry.type]} — redaktə`} footer={<><Button variant="dangerGhost" onClick={remove}>Sil</Button><Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Yadda saxla</Button></>}>
      <div className="space-y-4">
        {linked && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Bu qeyd cərimə ilə bağlıdır. Tam redaktə üçün «Cərimələr» bölməsindən istifadə edin.</div>}
        <Field label="Məbləğ (₼)"><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Tarix"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {entry.type === 'payment' && <Field label="Üsul"><Select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}><option value="cash">Nağd</option><option value="card">Kart</option></Select></Field>}
        <Field label="Qeyd"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function ChargeModal({ driver, carId, onClose }: { driver: Driver; carId?: string; onClose: () => void }) {
  const [type, setType] = useState<LedgerType>('damage');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  const save = () => {
    const v = Number(amount);
    if (!v) return toast('Məbləğ daxil edin');
    update(`${driver.name} — ${ledgerLabel[type]} ${money(v)} əlavə edildi`, (d) => ({ ...d, ledger: [...d.ledger, { id: uid(), driverId: driver.id, carId, date, type, amount: v, note: note || undefined }] }));
    toast('Əlavə edildi');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Borc əlavə et" footer={<><Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Əlavə et</Button></>}>
      <div className="space-y-4">
        <Field label="Növ"><Select value={type} onChange={(e) => setType(e.target.value as LedgerType)}><option value="damage">Zərər (qəza, cızıq)</option><option value="fine">Cərimə</option><option value="adjust">Düzəliş</option><option value="rent">Əlavə icarə</option></Select></Field>
        <Field label="Məbləğ (₼)" hint="Mənfi rəqəm yazsanız borc azalar (düzəliş üçün)"><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Tarix"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Qeyd"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="məs. arxa bamper" /></Field>
      </div>
    </Modal>
  );
}

function DriverForm({ driver, onClose }: { driver: Driver | null; onClose: () => void }) {
  const [f, setF] = useState<Driver>(driver ?? { id: uid(), name: '', phone: '+994', licenseNo: '', deposit: 300, debtLimit: 150, active: true, startDate: today() });
  const set = <K extends keyof Driver>(k: K, v: Driver[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () => {
    if (!f.name.trim()) return toast('Ad daxil edin');
    update(driver ? `Sürücü redaktə edildi: ${f.name}` : `Yeni sürücü: ${f.name}`, (d) => ({ ...d, drivers: driver ? d.drivers.map((x) => (x.id === f.id ? f : x)) : [...d.drivers, f] }));
    toast('Yadda saxlanıldı');
    onClose();
  };
  const db = useDB();
  const remove = async () => {
    if (!driver) return;
    if (db.ledger.some((l) => l.driverId === driver.id) || db.assignments.some((a) => a.driverId === driver.id)) return toast('Sürücünün əməliyyat tarixçəsi var. Silmək əvəzinə statusu «Passiv» edin.');
    if (!await ask(`${driver.name} silinsin?`)) return;
    update(`Sürücü silindi: ${driver.name}`, (d) => ({ ...d, drivers: d.drivers.filter((x) => x.id !== driver.id) }));
    location.hash = '#/drivers';
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={driver ? 'Sürücünü redaktə et' : 'Yeni sürücü'} footer={<>{driver && <Button variant="dangerGhost" onClick={remove}>Sil</Button>}<Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Yadda saxla</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><Field label="Ad, soyad"><Input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field></div>
        <Field label="Telefon"><Input type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Sürücülük vəsiqəsi"><Input value={f.licenseNo} onChange={(e) => set('licenseNo', e.target.value)} /></Field>
        <Field label="Depozit (₼)"><Input type="number" value={f.deposit} onChange={(e) => set('deposit', Number(e.target.value))} /></Field>
        <Field label="Borc limiti (₼)" hint="Keçəndə xəbərdarlıq gəlir"><Input type="number" value={f.debtLimit} onChange={(e) => set('debtLimit', Number(e.target.value))} /></Field>
        <Field label="Başlama tarixi"><Input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Status"><Select value={f.active ? '1' : '0'} onChange={(e) => set('active', e.target.value === '1')}><option value="1">Aktiv</option><option value="0">Passiv</option></Select></Field>
        <div className="md:col-span-2"><Field label="Qeyd"><Input value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

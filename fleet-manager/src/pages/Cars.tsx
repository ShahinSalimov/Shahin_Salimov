import { useMemo, useState } from 'react';
import { Plus, ArrowLeft, Droplets, Gauge, UserPlus, UserMinus, Pencil } from 'lucide-react';
import { update, useDB } from '../lib/store';
import { carProfit, currentAssignments, driverBalances } from '../lib/calc';
import { daysBetween, fmtDate, money, num, today, uid, addDays } from '../lib/format';
import type { Car, CarStatus } from '../lib/types';
import { Badge, Button, Card, DataList, Empty, Field, Input, Modal, PageHeader, SearchBox, Select, Tabs, toast } from '../components/ui';

export const statusLabel: Record<CarStatus, string> = { active: 'Xəttdə', service: 'Servisdə', idle: 'Boş' };
const statusTone = { active: 'green', service: 'amber', idle: 'slate' } as const;

function DocBadge({ date, label }: { date: string; label: string }) {
  const d = daysBetween(today(), date);
  if (d < 0) return <Badge tone="red">{label}: bitib</Badge>;
  if (d <= 7) return <Badge tone="amber">{label}: {d} gün</Badge>;
  return null;
}

export default function Cars() {
  const db = useDB();
  const [tab, setTab] = useState<'all' | CarStatus>('all');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Car | 'new' | null>(null);

  const { byCar } = currentAssignments(db);
  const drivers = new Map(db.drivers.map((d) => [d.id, d]));
  const rows = db.cars.filter((c) => {
    if (tab !== 'all' && c.status !== tab) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    const dn = drivers.get(byCar.get(c.id) ?? '')?.name.toLowerCase() ?? '';
    return c.plate.toLowerCase().includes(s) || `${c.make} ${c.model}`.toLowerCase().includes(s) || dn.includes(s);
  });

  return (
    <>
      <PageHeader title="Avtomobillər" subtitle={`${db.cars.length} avtomobil`} actions={<Button variant="primary" onClick={() => setEdit('new')}><Plus className="size-4" /> Yeni avtomobil</Button>} />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={tab} onChange={setTab} items={[
          { value: 'all', label: 'Hamısı', count: db.cars.length },
          { value: 'active', label: 'Xəttdə', count: db.cars.filter((c) => c.status === 'active').length },
          { value: 'service', label: 'Servisdə', count: db.cars.filter((c) => c.status === 'service').length },
          { value: 'idle', label: 'Boş', count: db.cars.filter((c) => c.status === 'idle').length },
        ]} />
        <div className="mb-4"><SearchBox value={q} onChange={setQ} placeholder="Nömrə, model, sürücü..." /></div>
      </div>
      <DataList
        rows={rows}
        limit={150}
        onRow={(c) => (location.hash = `#/cars/${c.id}`)}
        columns={[
          { head: 'Nömrə', cell: (c) => <span className="font-mono font-semibold">{c.plate}</span> },
          { head: 'Model', cell: (c) => <>{c.make} {c.model} <span className="text-slate-400">· {c.year}</span></> },
          { head: 'Sürücü', cell: (c) => drivers.get(byCar.get(c.id) ?? '')?.name ?? <span className="text-slate-400">—</span> },
          { head: 'Status', cell: (c) => <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge> },
          { head: 'Gündəlik', cell: (c) => <span className="tabular">{money(c.dailyRate)}</span>, className: 'text-right' },
          { head: 'Xəbərdarlıq', cell: (c) => <div className="flex flex-wrap gap-1"><DocBadge date={c.insuranceUntil} label="Sığorta" /><DocBadge date={c.inspectionUntil} label="Texbaxış" />{c.mileage - c.lastOilKm >= c.oilIntervalKm && <Badge tone="blue">Yağ</Badge>}</div> },
        ]}
        mobile={(c) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className="font-mono font-bold">{c.plate}</span><Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge></div>
              <div className="mt-0.5 truncate text-sm text-slate-500">{c.make} {c.model} · {drivers.get(byCar.get(c.id) ?? '')?.name ?? 'sürücü yoxdur'}</div>
              <div className="mt-1 flex flex-wrap gap-1"><DocBadge date={c.insuranceUntil} label="Sığorta" /><DocBadge date={c.inspectionUntil} label="Texbaxış" />{c.mileage - c.lastOilKm >= c.oilIntervalKm && <Badge tone="blue">Yağ</Badge>}</div>
            </div>
            <div className="tabular text-sm font-semibold">{money(c.dailyRate)}</div>
          </div>
        )}
      />
      {edit && <CarForm car={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

export function CarDetail({ id }: { id: string }) {
  const db = useDB();
  const [edit, setEdit] = useState(false);
  const [assign, setAssign] = useState(false);
  const [km, setKm] = useState(false);
  const car = db.cars.find((c) => c.id === id);
  const stats = useMemo(() => carProfit(db).find((x) => x.car.id === id), [db, id]);
  if (!car) return <Empty text="Avtomobil tapılmadı" />;
  const { byCar } = currentAssignments(db);
  const driver = db.drivers.find((d) => d.id === byCar.get(car.id));
  const history = db.assignments.filter((a) => a.carId === car.id).sort((a, b) => b.from.localeCompare(a.from));
  const expenses = db.expenses.filter((e) => e.carId === car.id).sort((a, b) => b.date.localeCompare(a.date));
  const fines = db.fines.filter((f) => f.carId === car.id);
  const oilLeft = car.oilIntervalKm - (car.mileage - car.lastOilKm);

  const setStatus = (status: CarStatus) => update(`${car.plate} statusu: ${statusLabel[status]}`, (d) => ({ ...d, cars: d.cars.map((c) => (c.id === car.id ? { ...c, status } : c)) }));
  const unassign = () => {
    if (!driver || !confirm(`${driver.name} maşından ayrılsın?`)) return;
    const t = today();
    update(`${car.plate} — ${driver.name} maşından ayrıldı`, (d) => ({
      ...d,
      assignments: d.assignments.map((a) => (a.carId === car.id && a.to === null ? { ...a, to: t } : a)),
      cars: d.cars.map((c) => (c.id === car.id ? { ...c, status: 'idle' } : c)),
    }));
  };
  const oilChange = () => {
    const cost = prompt('Yağ dəyişmə xərci (₼):', '75');
    if (cost === null) return;
    update(`${car.plate} — yağ dəyişdirildi (${num(car.mileage)} km)`, (d) => ({
      ...d,
      cars: d.cars.map((c) => (c.id === car.id ? { ...c, lastOilKm: c.mileage } : c)),
      expenses: [...d.expenses, { id: uid(), date: today(), business: 'taxi', category: 'oil', carId: car.id, amount: Number(cost) || 0, note: `${num(car.mileage)} km` }],
    }));
    toast('Yağ dəyişməsi qeyd edildi');
  };

  return (
    <>
      <a href="#/cars" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink"><ArrowLeft className="size-4" /> Avtomobillər</a>
      <PageHeader
        title={car.plate}
        subtitle={`${car.make} ${car.model} · ${car.year} · ${car.color}`}
        actions={<>
          <Select value={car.status} onChange={(e) => setStatus(e.target.value as CarStatus)} className="w-36">
            {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Button onClick={() => setEdit(true)}><Pencil className="size-4" /> Redaktə</Button>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-slate-500">Ümumi gəlir</div><div className="tabular mt-1 text-xl font-bold text-emerald-600">{money(stats?.income ?? 0)}</div></Card>
        <Card className="p-4"><div className="text-xs text-slate-500">Xərclər</div><div className="tabular mt-1 text-xl font-bold text-rose-600">{money(stats?.cost ?? 0)}</div></Card>
        <Card className="p-4"><div className="text-xs text-slate-500">Xalis mənfəət</div><div className="tabular mt-1 text-xl font-bold">{money(stats?.profit ?? 0)}</div></Card>
        <Card className="p-4"><div className="text-xs text-slate-500">Geri qaytarım</div><div className="tabular mt-1 text-xl font-bold">{car.purchasePrice ? `${Math.round(((stats?.profit ?? 0) / car.purchasePrice) * 100)}%` : '—'}</div><div className="text-xs text-slate-400">alış: {money(car.purchasePrice)}</div></Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 md:p-5">
          <div className="mb-3 font-semibold">Cari sürücü</div>
          {driver ? (
            <>
              <a href={`#/drivers/${driver.id}`} className="block rounded-xl bg-slate-50 p-3 hover:bg-slate-100">
                <div className="font-semibold">{driver.name}</div>
                <div className="text-sm text-slate-500">{driver.phone}</div>
                <div className="mt-1 text-sm">Borc: <b className="text-rose-600">{money(driverBalances(db).get(driver.id) ?? 0)}</b></div>
              </a>
              <Button variant="ghost" className="mt-2 w-full" onClick={unassign}><UserMinus className="size-4" /> Maşından ayır</Button>
            </>
          ) : (
            <Button variant="primary" className="w-full" onClick={() => setAssign(true)}><UserPlus className="size-4" /> Sürücü təyin et</Button>
          )}
        </Card>

        <Card className="p-4 md:p-5">
          <div className="mb-3 font-semibold">Texniki vəziyyət</div>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Yürüş</span><b className="tabular">{num(car.mileage)} km</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Yağa qalıb</span><b className={`tabular ${oilLeft <= 0 ? 'text-rose-600' : oilLeft < 1000 ? 'text-amber-600' : ''}`}>{oilLeft <= 0 ? `${num(-oilLeft)} km keçib` : `${num(oilLeft)} km`}</b></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${oilLeft <= 0 ? 'bg-rose-500' : oilLeft < 1000 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, ((car.mileage - car.lastOilKm) / car.oilIntervalKm) * 100)}%` }} /></div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => setKm(true)}><Gauge className="size-4" /> Yürüş</Button>
            <Button size="sm" className="flex-1" onClick={oilChange}><Droplets className="size-4" /> Yağ dəyişdi</Button>
          </div>
        </Card>

        <Card className="p-4 md:p-5">
          <div className="mb-3 font-semibold">Sənədlər</div>
          <div className="space-y-2.5 text-sm">
            <DocRow label="Sığorta" date={car.insuranceUntil} />
            <DocRow label="Texbaxış" date={car.inspectionUntil} />
            <div className="flex justify-between"><span className="text-slate-500">Gündəlik icarə</span><b>{money(car.dailyRate)}</b></div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4 md:p-5">
          <div className="mb-3 font-semibold">Sürücü tarixçəsi</div>
          {history.length === 0 ? <Empty text="Tarixçə yoxdur" /> : history.map((a) => (
            <div key={a.id} className="flex justify-between border-b border-slate-50 py-2 text-sm last:border-0">
              <span>{db.drivers.find((d) => d.id === a.driverId)?.name}</span>
              <span className="text-slate-500">{fmtDate(a.from)} — {a.to ? fmtDate(a.to) : 'indi'}</span>
            </div>
          ))}
          {fines.length > 0 && <div className="mt-3 text-sm text-slate-500">Cərimələr: <b className="text-ink">{fines.length}</b> ({money(fines.reduce((s, f) => s + f.amount, 0))})</div>}
        </Card>
        <Card className="p-4 md:p-5">
          <div className="mb-3 font-semibold">Xərclər</div>
          {expenses.length === 0 ? <Empty text="Xərc yoxdur" /> : expenses.slice(0, 12).map((e) => (
            <div key={e.id} className="flex justify-between border-b border-slate-50 py-2 text-sm last:border-0">
              <span>{expenseLabel[e.category]} <span className="text-slate-400">· {fmtDate(e.date)}</span></span>
              <b className="tabular">{money(e.amount)}</b>
            </div>
          ))}
        </Card>
      </div>

      {edit && <CarForm car={car} onClose={() => setEdit(false)} />}
      {assign && <AssignModal carId={car.id} onClose={() => setAssign(false)} />}
      {km && <MileageModal car={car} onClose={() => setKm(false)} />}
    </>
  );
}

export const expenseLabel: Record<string, string> = { oil: 'Yağ dəyişmə', repair: 'Təmir', tire: 'Təkər', insurance: 'Sığorta', inspection: 'Texbaxış', wash: 'Yuyulma', salary: 'Maaş', rent: 'İcarə', logistics: 'Logistika', other: 'Digər' };

function DocRow({ label, date }: { label: string; date: string }) {
  const d = daysBetween(today(), date);
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="flex items-center gap-2"><b>{fmtDate(date)}</b>{d < 0 ? <Badge tone="red">bitib</Badge> : d <= 7 ? <Badge tone="amber">{d} gün</Badge> : null}</span>
    </div>
  );
}

function MileageModal({ car, onClose }: { car: Car; onClose: () => void }) {
  const [v, setV] = useState(String(car.mileage));
  return (
    <Modal open onClose={onClose} title={`Yürüş — ${car.plate}`} footer={<><Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={() => {
      const n = Number(v);
      if (!n || n < car.mileage) return toast('Yeni yürüş köhnədən az ola bilməz');
      update(`${car.plate} yürüşü yeniləndi: ${num(n)} km`, (d) => ({ ...d, cars: d.cars.map((c) => (c.id === car.id ? { ...c, mileage: n } : c)) }));
      onClose();
    }}>Yadda saxla</Button></>}>
      <Field label="Cari yürüş (km)"><Input type="number" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} autoFocus /></Field>
    </Modal>
  );
}

export function AssignModal({ carId, driverId, onClose }: { carId?: string; driverId?: string; onClose: () => void }) {
  const db = useDB();
  const { byCar, byDriver } = currentAssignments(db);
  const [car, setCar] = useState(carId ?? '');
  const [driver, setDriver] = useState(driverId ?? '');
  const [from, setFrom] = useState(today());
  const freeCars = db.cars.filter((c) => !byCar.has(c.id) || c.id === carId);
  const freeDrivers = db.drivers.filter((d) => !byDriver.has(d.id) || d.id === driverId);
  const save = () => {
    if (!car || !driver) return toast('Maşın və sürücü seçin');
    const c = db.cars.find((x) => x.id === car)!;
    const dr = db.drivers.find((x) => x.id === driver)!;
    update(`${c.plate} → ${dr.name} təyin edildi`, (d) => {
      // yeni icarə üçün başlanğıc tarixindən bu günə qədər icarə haqqı yaz
      const rent: typeof d.ledger = [];
      for (let day = from; day <= today(); day = addDays(day, 1)) {
        if (!d.ledger.some((l) => l.type === 'rent' && l.driverId === driver && l.date === day)) {
          rent.push({ id: uid(), driverId: driver, carId: car, date: day, type: 'rent', amount: c.dailyRate });
        }
      }
      return {
        ...d,
        ledger: [...d.ledger, ...rent],
        assignments: [...d.assignments, { id: uid(), carId: car, driverId: driver, from, to: null }],
        cars: d.cars.map((x) => (x.id === car ? { ...x, status: 'active' as const } : x)),
        drivers: d.drivers.map((x) => (x.id === driver ? { ...x, active: true } : x)),
      };
    });
    toast('Təyin edildi');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Maşın təyin et" footer={<><Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Təyin et</Button></>}>
      <div className="space-y-4">
        <Field label="Avtomobil">
          <Select value={car} onChange={(e) => setCar(e.target.value)} disabled={!!carId}>
            <option value="">Seçin...</option>
            {freeCars.map((c) => <option key={c.id} value={c.id}>{c.plate} · {c.make} {c.model} · {money(c.dailyRate)}</option>)}
          </Select>
        </Field>
        <Field label="Sürücü">
          <Select value={driver} onChange={(e) => setDriver(e.target.value)} disabled={!!driverId}>
            <option value="">Seçin...</option>
            {freeDrivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Başlama tarixi" hint="Bu tarixdən etibarən gündəlik icarə avtomatik borc kimi yazılır"><Input type="date" value={from} max={today()} onChange={(e) => setFrom(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function CarForm({ car, onClose }: { car: Car | null; onClose: () => void }) {
  const db = useDB();
  const [f, setF] = useState<Car>(car ?? {
    id: uid(), plate: '', make: 'Toyota', model: 'Prius', year: 2020, color: 'Ağ', status: 'idle',
    dailyRate: db.settings.defaultDailyRate, mileage: 0, lastOilKm: 0, oilIntervalKm: 10000,
    insuranceUntil: addDays(today(), 365), inspectionUntil: addDays(today(), 365), purchasePrice: 0,
  });
  const set = <K extends keyof Car>(k: K, v: Car[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () => {
    if (!f.plate.trim()) return toast('Nömrə daxil edin');
    const plate = f.plate.trim().toUpperCase();
    if (db.cars.some((c) => c.plate === plate && c.id !== f.id)) return toast('Bu nömrə artıq var');
    const rec = { ...f, plate };
    update(car ? `Avtomobil redaktə edildi: ${plate}` : `Yeni avtomobil: ${plate}`, (d) => ({ ...d, cars: car ? d.cars.map((c) => (c.id === f.id ? rec : c)) : [...d.cars, rec] }));
    toast('Yadda saxlanıldı');
    onClose();
  };
  const remove = () => {
    if (!car) return;
    if (db.assignments.some((a) => a.carId === car.id) || db.expenses.some((e) => e.carId === car.id) || db.fines.some((x) => x.carId === car.id)) return toast('Maşının tarixçəsi var. Silmək əvəzinə statusu «Boş» edin.');
    if (!confirm(`${car.plate} silinsin?`)) return;
    update(`Avtomobil silindi: ${car.plate}`, (d) => ({ ...d, cars: d.cars.filter((x) => x.id !== car.id) }));
    location.hash = '#/cars';
    onClose();
  };
  return (
    <Modal open wide onClose={onClose} title={car ? 'Avtomobili redaktə et' : 'Yeni avtomobil'} footer={<>{car && <Button variant="ghost" className="text-rose-600" onClick={remove}>Sil</Button>}<Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Yadda saxla</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Dövlət nömrəsi"><Input value={f.plate} onChange={(e) => set('plate', e.target.value)} placeholder="10-AB-123" /></Field>
        <Field label="Gündəlik icarə (₼)"><Input type="number" value={f.dailyRate} onChange={(e) => set('dailyRate', Number(e.target.value))} /></Field>
        <Field label="Marka"><Input value={f.make} onChange={(e) => set('make', e.target.value)} /></Field>
        <Field label="Model"><Input value={f.model} onChange={(e) => set('model', e.target.value)} /></Field>
        <Field label="Buraxılış ili"><Input type="number" value={f.year} onChange={(e) => set('year', Number(e.target.value))} /></Field>
        <Field label="Rəng"><Input value={f.color} onChange={(e) => set('color', e.target.value)} /></Field>
        <Field label="Yürüş (km)"><Input type="number" value={f.mileage} onChange={(e) => set('mileage', Number(e.target.value))} /></Field>
        <Field label="Son yağ dəyişmə (km)"><Input type="number" value={f.lastOilKm} onChange={(e) => set('lastOilKm', Number(e.target.value))} /></Field>
        <Field label="Sığorta bitmə tarixi"><Input type="date" value={f.insuranceUntil} onChange={(e) => set('insuranceUntil', e.target.value)} /></Field>
        <Field label="Texbaxış tarixi"><Input type="date" value={f.inspectionUntil} onChange={(e) => set('inspectionUntil', e.target.value)} /></Field>
        <Field label="Alış qiyməti (₼)"><Input type="number" value={f.purchasePrice} onChange={(e) => set('purchasePrice', Number(e.target.value))} /></Field>
        <Field label="Yağ intervalı (km)"><Input type="number" value={f.oilIntervalKm} onChange={(e) => set('oilIntervalKm', Number(e.target.value))} /></Field>
      </div>
    </Modal>
  );
}

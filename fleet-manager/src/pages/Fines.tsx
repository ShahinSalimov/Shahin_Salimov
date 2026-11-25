import { useState } from 'react';
import { Plus, Check, Pencil } from 'lucide-react';
import { update, useDB } from '../lib/store';
import { driverAt } from '../lib/calc';
import { fmtDate, money, today, uid } from '../lib/format';
import type { Fine } from '../lib/types';
import { Badge, Button, DataList, Field, Input, Modal, PageHeader, Select, Tabs, toast } from '../components/ui';

export default function Fines() {
  const db = useDB();
  const [tab, setTab] = useState<'unpaid' | 'paid' | 'all'>('unpaid');
  const [open, setOpen] = useState<Fine | 'new' | null>(null);
  const cars = new Map(db.cars.map((c) => [c.id, c]));
  const drivers = new Map(db.drivers.map((d) => [d.id, d]));
  const rows = db.fines.filter((f) => (tab === 'all' ? true : tab === 'paid' ? f.paid : !f.paid)).sort((a, b) => b.datetime.localeCompare(a.datetime));
  const unpaidSum = db.fines.filter((f) => !f.paid).reduce((s, f) => s + f.amount, 0);

  const markPaid = (id: string) => {
    const f = db.fines.find((x) => x.id === id)!;
    update(`Cərimə ödənildi: ${cars.get(f.carId)?.plate} ${money(f.amount)}`, (d) => ({ ...d, fines: d.fines.map((x) => (x.id === id ? { ...x, paid: true } : x)) }));
    toast('Ödənildi kimi qeyd edildi');
  };

  return (
    <>
      <PageHeader title="Cərimələr" subtitle={`Ödənilməmiş: ${money(unpaidSum)}`} actions={<Button variant="primary" onClick={() => setOpen('new')}><Plus className="size-4" /> Cərimə əlavə et</Button>} />
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'unpaid', label: 'Ödənilməyib', count: db.fines.filter((f) => !f.paid).length },
        { value: 'paid', label: 'Ödənilib', count: db.fines.filter((f) => f.paid).length },
        { value: 'all', label: 'Hamısı', count: db.fines.length },
      ]} />
      <DataList
        rows={rows}
        onRow={(f) => setOpen(f)}
        columns={[
          { head: 'Tarix', cell: (f) => <span className="whitespace-nowrap">{fmtDate(f.datetime)} <span className="text-slate-400">{f.datetime.slice(11)}</span></span> },
          { head: 'Maşın', cell: (f) => <span className="font-mono font-semibold">{cars.get(f.carId)?.plate}</span> },
          { head: 'Sürücü', cell: (f) => (f.driverId ? <a className="hover:underline" href={`#/drivers/${f.driverId}`}>{drivers.get(f.driverId)?.name}</a> : <span className="text-slate-400">təyin olunmayıb</span>) },
          { head: 'Səbəb', cell: (f) => f.reason },
          { head: 'Məbləğ', cell: (f) => <span className="tabular font-semibold">{money(f.amount)}</span>, className: 'text-right' },
          { head: 'Status', cell: (f) => <div className="flex items-center gap-1.5">{f.paid ? <Badge tone="green">Ödənilib</Badge> : <Badge tone="red">Ödənilməyib</Badge>}{f.chargedToDriver && <Badge tone="violet">Sürücüyə yazılıb</Badge>}</div> },
          { head: '', cell: (f) => <div className="flex justify-end gap-1">{!f.paid && <Button size="sm" onClick={(e) => { e.stopPropagation(); markPaid(f.id); }}><Check className="size-3.5" /> Ödənildi</Button>}<Button size="sm" variant="ghost" aria-label="Redaktə"><Pencil className="size-3.5" /></Button></div> },
        ]}
        mobile={(f) => (
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold">{cars.get(f.carId)?.plate}</span>
              <span className="tabular font-bold">{money(f.amount)}</span>
            </div>
            <div className="mt-0.5 text-sm text-slate-500">{f.reason} · {fmtDate(f.datetime)} {f.datetime.slice(11)}</div>
            <div className="mt-0.5 text-sm">{f.driverId ? drivers.get(f.driverId)?.name : 'sürücü təyin olunmayıb'}</div>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex gap-1.5">{f.paid ? <Badge tone="green">Ödənilib</Badge> : <Badge tone="red">Ödənilməyib</Badge>}{f.chargedToDriver && <Badge tone="violet">Sürücüyə yazılıb</Badge>}</div>
              {!f.paid && <Button size="sm" onClick={(e) => { e.stopPropagation(); markPaid(f.id); }}>Ödənildi</Button>}
            </div>
          </div>
        )}
      />
      {open && <FineForm fine={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
    </>
  );
}

function FineForm({ fine, onClose }: { fine: Fine | null; onClose: () => void }) {
  const db = useDB();
  const [carId, setCarId] = useState(fine?.carId ?? '');
  const [dt, setDt] = useState(fine?.datetime ?? `${today()}T12:00`);
  const [amount, setAmount] = useState(fine ? String(fine.amount) : '');
  const [reason, setReason] = useState(fine?.reason ?? 'Sürət həddinin aşılması');
  const [charge, setCharge] = useState(fine?.chargedToDriver ?? true);
  const [paid, setPaid] = useState(fine?.paid ?? false);
  const driverId = carId ? driverAt(db, carId, dt) : null;
  const driver = db.drivers.find((d) => d.id === driverId);
  const save = () => {
    const v = Number(amount);
    if (!carId || !v) return toast('Maşın və məbləğ seçin');
    const date = dt.slice(0, 10);
    const plate = db.cars.find((c) => c.id === carId)?.plate;
    const id = fine?.id ?? uid();
    const rec: Fine = { id, carId, driverId, datetime: dt, amount: v, reason, paid, chargedToDriver: !!driverId && charge };
    update(`${fine ? 'Cərimə redaktə edildi' : 'Cərimə'}: ${plate} ${money(v)}${driver && charge ? ` → ${driver.name}` : ''}`, (d) => {
      // köhnə əlaqəli borc qeydini sil, lazımdırsa yenisini yaz
      const ledger = d.ledger.filter((l) => !(l.type === 'fine' && l.refId === id));
      if (rec.chargedToDriver && driverId) ledger.push({ id: uid(), driverId, carId, date, type: 'fine', amount: v, note: reason, refId: id });
      return { ...d, fines: fine ? d.fines.map((x) => (x.id === id ? rec : x)) : [...d.fines, rec], ledger };
    });
    toast(fine ? 'Yadda saxlanıldı' : driver && charge ? `Cərimə ${driver.name} hesabına yazıldı` : 'Cərimə əlavə edildi');
    onClose();
  };
  const remove = () => {
    if (!fine || !confirm('Cərimə silinsin? Sürücüyə yazılan borc da silinəcək.')) return;
    update(`Cərimə silindi: ${money(fine.amount)}`, (d) => ({ ...d, fines: d.fines.filter((x) => x.id !== fine.id), ledger: d.ledger.filter((l) => !(l.type === 'fine' && l.refId === fine.id)) }));
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={fine ? 'Cəriməni redaktə et' : 'Yeni cərimə'} footer={<>{fine && <Button variant="ghost" className="text-rose-600" onClick={remove}>Sil</Button>}<Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Yadda saxla</Button></>}>
      <div className="space-y-4">
        <Field label="Avtomobil">
          <Select value={carId} onChange={(e) => setCarId(e.target.value)}>
            <option value="">Seçin...</option>
            {[...db.cars].sort((a, b) => a.plate.localeCompare(b.plate)).map((c) => <option key={c.id} value={c.id}>{c.plate} · {c.make} {c.model}</option>)}
          </Select>
        </Field>
        <Field label="Pozuntu tarixi və saatı"><Input type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} /></Field>
        {carId && (
          <div className={`rounded-xl p-3 text-sm ${driver ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            {driver ? <>Həmin vaxt maşın <b>{driver.name}</b>-da olub. Sistem avtomatik tapdı.</> : 'Həmin tarixdə maşın heç bir sürücüdə olmayıb.'}
          </div>
        )}
        <Field label="Məbləğ (₼)"><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Səbəb"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {driver && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={charge} onChange={(e) => setCharge(e.target.checked)} className="size-4 accent-yellow-500" /> Sürücünün borcuna yaz</label>
        )}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="size-4 accent-yellow-500" /> Cərimə dövlətə ödənilib</label>
      </div>
    </Modal>
  );
}

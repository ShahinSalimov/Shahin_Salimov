import { useMemo, useState } from 'react';
import { Plus, Pencil, Wallet, MessageCircle, Phone, Trash2 } from 'lucide-react';
import { update, useDB } from '../lib/store';
import { customerDebts, saleProfit, waLink } from '../lib/calc';
import { fmtDate, money, today, uid } from '../lib/format';
import type { Customer, CustomerPayment, PayMethod, Sale } from '../lib/types';
import { Badge, Button, DataList, Field, Input, Modal, PageHeader, SearchBox, Select, Tabs, toast } from '../components/ui';
import { Invoice } from './Sales';

export default function Customers() {
  const db = useDB();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | 'debt'>('all');
  const [edit, setEdit] = useState<Customer | 'new' | null>(null);
  const [view, setView] = useState<Customer | null>(null);
  const data = useMemo(() => {
    const debts = customerDebts(db);
    return db.customers.map((c) => {
      const sales = db.sales.filter((s) => s.customerId === c.id);
      return { c, debt: debts.get(c.id) ?? 0, total: sales.reduce((s, x) => s + x.total, 0), count: sales.length, last: sales.map((s) => s.date).sort().pop() };
    });
  }, [db]);
  const rows = data
    .filter((r) => (tab === 'debt' ? r.debt > 0 : true))
    .filter((r) => !q || `${r.c.shop} ${r.c.name} ${r.c.phone}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.debt - a.debt || b.total - a.total);
  const totalDebt = data.reduce((s, r) => s + Math.max(0, r.debt), 0);

  return (
    <>
      <PageHeader title="Müştərilər" subtitle={`Ümumi nisyə: ${money(totalDebt)}`} actions={<Button variant="primary" onClick={() => setEdit('new')}><Plus className="size-4" /> Yeni müştəri</Button>} />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'all', label: 'Hamısı', count: data.length }, { value: 'debt', label: 'Borclular', count: data.filter((r) => r.debt > 0).length }]} />
        <div className="mb-4"><SearchBox value={q} onChange={setQ} placeholder="Mağaza, ad, telefon..." /></div>
      </div>
      <DataList
        rows={rows}
        onRow={(r) => setView(r.c)}
        columns={[
          { head: 'Mağaza', cell: (r) => <div><div className="font-medium">{r.c.shop}</div><div className="text-xs text-slate-400">{r.c.address}</div></div> },
          { head: 'Əlaqə', cell: (r) => <div><div>{r.c.name}</div><div className="text-xs text-slate-400">{r.c.phone}</div></div> },
          { head: 'Fakturalar', cell: (r) => <span className="tabular">{r.count}</span>, className: 'text-right' },
          { head: 'Dövriyyə', cell: (r) => <span className="tabular">{money(r.total)}</span>, className: 'text-right' },
          { head: 'Son alış', cell: (r) => (r.last ? fmtDate(r.last) : '—') },
          { head: 'Borc', cell: (r) => <span className={`tabular font-semibold ${r.debt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{r.debt > 0 ? money(r.debt) : '0 ₼'}</span>, className: 'text-right' },
        ]}
        mobile={(r) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0"><div className="truncate font-semibold">{r.c.shop}</div><div className="text-xs text-slate-500">{r.c.name} · {r.count} faktura · {money(r.total)}</div></div>
            <div className={`tabular font-bold ${r.debt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{r.debt > 0 ? money(r.debt) : '0 ₼'}</div>
          </div>
        )}
      />
      {edit && <CustomerForm customer={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {view && <CustomerView customer={view} onClose={() => setView(null)} onEdit={() => { setEdit(view); setView(null); }} />}
    </>
  );
}

function CustomerView({ customer, onClose, onEdit }: { customer: Customer; onClose: () => void; onEdit: () => void }) {
  const db = useDB();
  const [pay, setPay] = useState<CustomerPayment | 'new' | null>(null);
  const [invoice, setInvoice] = useState<Sale | null>(null);
  const c = db.customers.find((x) => x.id === customer.id) ?? customer;
  const debt = customerDebts(db).get(c.id) ?? 0;
  const sales = db.sales.filter((s) => s.customerId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const payments = db.customerPayments.filter((p) => p.customerId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const profit = sales.reduce((s, x) => s + saleProfit(x), 0);
  const msg = `Salam ${c.name.split(' ')[0]}, ${db.settings.companyName}. ${fmtDate(today())} tarixinə qalıq borcunuz: ${money(Math.max(0, debt))}. Təşəkkürlər.`;
  return (
    <Modal open wide onClose={onClose} title={c.shop} footer={<>
      <Button onClick={onEdit}><Pencil className="size-4" /> Redaktə</Button>
      <Button variant="success" onClick={() => setPay('new')}><Wallet className="size-4" /> Ödəniş qəbul et</Button>
    </>}>
      <div className="flex flex-wrap gap-2">
        <a href={`tel:${c.phone}`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm"><Phone className="size-4" /> {c.phone}</a>
        <a href={waLink(c.phone, msg)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm text-emerald-700"><MessageCircle className="size-4" /> Borc xatırlatması</a>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Borc</div><div className={`tabular font-bold ${debt > 0 ? 'text-rose-600' : ''}`}>{money(debt)}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Dövriyyə</div><div className="tabular font-bold">{money(sales.reduce((s, x) => s + x.total, 0))}</div></div>
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Mənfəət</div><div className="tabular font-bold text-emerald-600">{money(profit)}</div></div>
      </div>
      <div className="mt-5 text-sm font-semibold">Fakturalar</div>
      {sales.length === 0 ? <div className="py-3 text-sm text-slate-400">Yoxdur</div> : sales.map((s) => (
        <button key={s.id} onClick={() => setInvoice(s)} className="flex w-full items-center justify-between border-b border-slate-50 py-2 text-left text-sm hover:bg-slate-50">
          <span><span className="font-mono text-slate-500">#{s.no}</span> · {fmtDate(s.date)}</span>
          <span className="flex items-center gap-2"><span className="tabular font-medium">{money(s.total)}</span>{s.paid < s.total && <Badge tone="red">qalıq {money(s.total - s.paid)}</Badge>}</span>
        </button>
      ))}
      <div className="mt-5 text-sm font-semibold">Ödənişlər</div>
      {payments.length === 0 ? <div className="py-3 text-sm text-slate-400">Yoxdur</div> : payments.map((p) => (
        <button key={p.id} onClick={() => setPay(p)} className="flex w-full justify-between border-b border-slate-50 py-2 text-left text-sm hover:bg-slate-50">
          <span>{fmtDate(p.date)} · {p.method === 'cash' ? 'nağd' : 'kart'}</span>
          <span className="tabular font-medium text-emerald-600">+{money(p.amount)}</span>
        </button>
      ))}
      {pay && <PaymentForm customer={c} payment={pay === 'new' ? null : pay} debt={debt} onClose={() => setPay(null)} />}
      {invoice && <Invoice sale={invoice} onClose={() => setInvoice(null)} />}
    </Modal>
  );
}

function PaymentForm({ customer, payment, debt, onClose }: { customer: Customer; payment: CustomerPayment | null; debt: number; onClose: () => void }) {
  const [amount, setAmount] = useState(payment ? String(payment.amount) : debt > 0 ? String(Math.round(debt)) : '');
  const [method, setMethod] = useState<PayMethod>(payment?.method ?? 'cash');
  const [date, setDate] = useState(payment?.date ?? today());
  const save = () => {
    const v = Number(amount);
    if (!v) return toast('Məbləğ daxil edin');
    const rec: CustomerPayment = { id: payment?.id ?? uid(), customerId: customer.id, date, amount: v, method };
    update(`${payment ? 'Müştəri ödənişi redaktə edildi' : 'Müştəri ödənişi'}: ${customer.shop} ${money(v)}`, (d) => ({ ...d, customerPayments: payment ? d.customerPayments.map((x) => (x.id === rec.id ? rec : x)) : [...d.customerPayments, rec] }));
    toast('Yadda saxlanıldı');
    onClose();
  };
  const remove = () => {
    if (!payment || !confirm('Ödəniş silinsin?')) return;
    update(`Müştəri ödənişi silindi: ${customer.shop} ${money(payment.amount)}`, (d) => ({ ...d, customerPayments: d.customerPayments.filter((x) => x.id !== payment.id) }));
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={payment ? 'Ödənişi redaktə et' : `Ödəniş — ${customer.shop}`} footer={<>{payment && <Button variant="ghost" className="text-rose-600" onClick={remove}><Trash2 className="size-4" /> Sil</Button>}<Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Yadda saxla</Button></>}>
      <div className="space-y-4">
        <Field label="Məbləğ (₼)"><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Üsul"><Select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}><option value="cash">Nağd</option><option value="card">Kart / köçürmə</option></Select></Field>
        <Field label="Tarix"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function CustomerForm({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const db = useDB();
  const [f, setF] = useState<Customer>(customer ?? { id: uid(), name: '', shop: '', phone: '+994', address: '' });
  const set = <K extends keyof Customer>(k: K, v: Customer[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () => {
    if (!f.shop.trim()) return toast('Mağaza adını daxil edin');
    update(customer ? `Müştəri redaktə edildi: ${f.shop}` : `Yeni müştəri: ${f.shop}`, (d) => ({ ...d, customers: customer ? d.customers.map((x) => (x.id === f.id ? f : x)) : [...d.customers, f] }));
    toast('Yadda saxlanıldı');
    onClose();
  };
  const remove = () => {
    if (!customer) return;
    if (db.sales.some((s) => s.customerId === customer.id)) return toast('Bu müştərinin fakturaları var — əvvəlcə onları silin');
    if (!confirm(`${customer.shop} silinsin?`)) return;
    update(`Müştəri silindi: ${customer.shop}`, (d) => ({ ...d, customers: d.customers.filter((x) => x.id !== customer.id), customerPayments: d.customerPayments.filter((p) => p.customerId !== customer.id) }));
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={customer ? 'Müştərini redaktə et' : 'Yeni müştəri'} footer={<>{customer && <Button variant="ghost" className="text-rose-600" onClick={remove}>Sil</Button>}<Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Yadda saxla</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Mağaza adı"><Input value={f.shop} onChange={(e) => set('shop', e.target.value)} autoFocus /></Field>
        <Field label="Əlaqədar şəxs"><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Telefon"><Input type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Ünvan"><Input value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

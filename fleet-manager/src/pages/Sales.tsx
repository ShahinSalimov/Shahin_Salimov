import { useMemo, useState } from 'react';
import { Plus, Trash2, Printer, MessageCircle, Pencil } from 'lucide-react';
import { update, useDB } from '../lib/store';
import { saleProfit, waLink } from '../lib/calc';
import { fmtDate, money, monthKey, monthName, today, uid } from '../lib/format';
import type { Sale, SaleItem } from '../lib/types';
import { Badge, Button, DataList, Field, Input, Modal, PageHeader, Select, Stat, toast, ask, canPrint } from '../components/ui';
import { productName } from './Inventory';

export default function Sales() {
  const db = useDB();
  const [month, setMonth] = useState(monthKey(today()));
  const [open, setOpen] = useState<Sale | 'new' | null>(null);
  const [view, setView] = useState<Sale | null>(null);
  const customers = new Map(db.customers.map((c) => [c.id, c]));
  const months = [...new Set(db.sales.map((s) => monthKey(s.date)).concat(monthKey(today())))].sort().reverse();
  const rows = db.sales.filter((s) => monthKey(s.date) === month).sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);
  const total = rows.reduce((s, x) => s + x.total, 0);
  const profit = rows.reduce((s, x) => s + saleProfit(x), 0);
  const unpaid = rows.reduce((s, x) => s + (x.total - x.paid), 0);

  return (
    <>
      <PageHeader title="Satış" subtitle="Topdan fakturalar" actions={<>
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-40">{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</Select>
        <Button variant="primary" onClick={() => setOpen('new')}><Plus className="size-4" /> Yeni satış</Button>
      </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Satış həcmi" value={money(total)} sub={`${rows.length} faktura`} />
        <Stat label="Mənfəət" value={money(profit)} tone="green" sub={total ? `marja ${Math.round((profit / total) * 100)}%` : ''} />
        <Stat label="Nisyə (bu ay)" value={money(unpaid)} tone={unpaid ? 'red' : 'slate'} />
        <Stat label="Orta faktura" value={money(rows.length ? total / rows.length : 0)} />
      </div>
      <DataList
        rows={rows}
        onRow={setView}
        columns={[
          { head: '№', cell: (s) => <span className="font-mono text-slate-500">#{s.no}</span> },
          { head: 'Tarix', cell: (s) => fmtDate(s.date) },
          { head: 'Müştəri', cell: (s) => <span className="font-medium">{customers.get(s.customerId)?.shop}</span> },
          { head: 'Məhsul', cell: (s) => <span className="text-slate-500">{s.items.reduce((a, i) => a + i.qty, 0)} ədəd</span> },
          { head: 'Məbləğ', cell: (s) => <span className="tabular font-semibold">{money(s.total)}</span>, className: 'text-right' },
          { head: 'Mənfəət', cell: (s) => <span className="tabular text-emerald-600">{money(saleProfit(s))}</span>, className: 'text-right' },
          { head: 'Ödəniş', cell: (s) => (s.paid >= s.total ? <Badge tone="green">Ödənilib</Badge> : s.paid > 0 ? <Badge tone="amber">Qismən</Badge> : <Badge tone="red">Nisyə</Badge>) },
        ]}
        mobile={(s) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-semibold">{customers.get(s.customerId)?.shop}</div>
              <div className="text-xs text-slate-500">#{s.no} · {fmtDate(s.date)} · {s.items.reduce((a, i) => a + i.qty, 0)} ədəd</div>
            </div>
            <div className="text-right">
              <div className="tabular font-bold">{money(s.total)}</div>
              {s.paid >= s.total ? <Badge tone="green">Ödənilib</Badge> : <Badge tone="red">Qalıq {money(s.total - s.paid)}</Badge>}
            </div>
          </div>
        )}
      />
      {open && <SaleForm sale={open === 'new' ? null : open} onClose={() => setOpen(null)} onSaved={setView} />}
      {view && <Invoice sale={view} onClose={() => setView(null)} onEdit={() => { setOpen(view); setView(null); }} />}
    </>
  );
}

function SaleForm({ sale, onClose, onSaved }: { sale: Sale | null; onClose: () => void; onSaved: (s: Sale) => void }) {
  const db = useDB();
  const [customerId, setCustomerId] = useState(sale?.customerId ?? '');
  const [date, setDate] = useState(sale?.date ?? today());
  const [items, setItems] = useState<SaleItem[]>(sale ? sale.items.map((i) => ({ ...i })) : [{ productId: '', qty: 1, price: 0, cost: 0 }]);
  const [paidMode, setPaidMode] = useState<'full' | 'credit' | 'partial'>(!sale || sale.paid >= sale.total ? 'full' : sale.paid === 0 ? 'credit' : 'partial');
  const [partial, setPartial] = useState(sale && sale.paid < sale.total ? String(sale.paid) : '');
  // redaktədə köhnə fakturanın malları anbara "qaytarılmış" sayılır
  const products = useMemo(() => new Map(db.products.map((p) => {
    const back = sale ? sale.items.filter((i) => i.productId === p.id).reduce((s, i) => s + i.qty, 0) : 0;
    return [p.id, { ...p, qty: p.qty + back }];
  })), [db.products, sale]);
  const total = Math.round(items.reduce((s, i) => s + i.qty * i.price, 0) * 100) / 100;
  const profit = items.reduce((s, i) => s + (i.price - i.cost) * i.qty, 0);
  const setItem = (i: number, patch: Partial<SaleItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = () => {
    if (!customerId) return toast('Müştəri seçin');
    const valid = items.filter((i) => i.productId && i.qty > 0);
    if (!valid.length) return toast('Məhsul əlavə edin');
    for (const i of valid) {
      const p = products.get(i.productId)!;
      const need = valid.filter((x) => x.productId === i.productId).reduce((s, x) => s + x.qty, 0);
      if (need > p.qty) return toast(`${productName(p)}: anbarda ${p.qty} ədəd var`);
    }
    const paid = paidMode === 'full' ? total : paidMode === 'credit' ? 0 : Math.min(total, Number(partial) || 0);
    const no = sale?.no ?? Math.max(1000, ...db.sales.map((s) => s.no)) + 1;
    const rec: Sale = { id: sale?.id ?? uid(), no, date, customerId, items: valid, total, paid };
    update(`${sale ? 'Faktura redaktə edildi' : 'Satış'} #${no}: ${db.customers.find((c) => c.id === customerId)?.shop} — ${money(total)}`, (d) => ({
      ...d,
      sales: sale ? d.sales.map((x) => (x.id === sale.id ? rec : x)) : [...d.sales, rec],
      products: d.products.map((p) => {
        const back = sale ? sale.items.filter((i) => i.productId === p.id).reduce((s, i) => s + i.qty, 0) : 0;
        const q = valid.filter((i) => i.productId === p.id).reduce((s, i) => s + i.qty, 0);
        return q || back ? { ...p, qty: p.qty + back - q } : p;
      }),
    }));
    toast(sale ? `Faktura #${no} yeniləndi` : `Faktura #${no} yaradıldı`);
    onClose();
    onSaved(rec);
  };

  return (
    <Modal open wide onClose={onClose} title={sale ? `Fakturanı redaktə et #${sale.no}` : 'Yeni satış'} footer={<><Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Satışı təsdiqlə · {money(total)}</Button></>}>
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Field label="Müştəri (mağaza)">
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Seçin...</option>
            {db.customers.map((c) => <option key={c.id} value={c.id}>{c.shop} — {c.name}</option>)}
          </Select>
        </Field>
        <Field label="Tarix"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="space-y-3">
        {items.map((it, i) => {
          const p = products.get(it.productId);
          return (
            <div key={i} className="rounded-xl border border-slate-200 p-3">
              <div className="flex gap-2">
                <Select value={it.productId} onChange={(e) => { const np = products.get(e.target.value); setItem(i, { productId: e.target.value, price: np?.price ?? 0, cost: np?.cost ?? 0 }); }}>
                  <option value="">Məhsul seçin...</option>
                  {[...products.values()].filter((x) => x.qty > 0 || x.id === it.productId).map((x) => <option key={x.id} value={x.id}>{productName(x)} — {x.qty} ədəd</option>)}
                </Select>
                <button className="px-1 text-slate-300 hover:text-rose-500" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label="Sil"><Trash2 className="size-4" /></button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Field label="Say"><Input type="number" inputMode="numeric" value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} /></Field>
                <Field label="Qiymət ₼"><Input type="number" inputMode="decimal" value={it.price} onChange={(e) => setItem(i, { price: Number(e.target.value) })} /></Field>
                <Field label="Cəm"><div className="tabular flex h-11 items-center font-semibold md:h-10">{money(it.qty * it.price)}</div></Field>
              </div>
              {p?.category === 'phone' && <div className="mt-2"><Input value={it.imei ?? ''} onChange={(e) => setItem(i, { imei: e.target.value })} placeholder="IMEI (vergüllə ayırın)" /></div>}
              {p && it.price < p.cost && <div className="mt-1 text-xs font-medium text-rose-600">Diqqət: qiymət maya dəyərindən aşağıdır ({money(p.cost)})</div>}
            </div>
          );
        })}
        <Button size="sm" onClick={() => setItems((xs) => [...xs, { productId: '', qty: 1, price: 0, cost: 0 }])}><Plus className="size-4" /> Məhsul əlavə et</Button>
      </div>
      <div className="mt-5 rounded-xl bg-slate-50 p-4">
        <div className="flex justify-between text-sm"><span className="text-slate-500">Cəmi</span><b className="tabular text-lg">{money(total)}</b></div>
        <div className="flex justify-between text-sm"><span className="text-slate-500">Mənfəət</span><b className="tabular text-emerald-600">{money(profit)}</b></div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(['full', 'partial', 'credit'] as const).map((m) => (
            <Button key={m} size="sm" variant={paidMode === m ? 'dark' : 'secondary'} onClick={() => setPaidMode(m)}>{{ full: 'Tam ödəndi', partial: 'Qismən', credit: 'Nisyə' }[m]}</Button>
          ))}
        </div>
        {paidMode === 'partial' && <div className="mt-2"><Input type="number" value={partial} onChange={(e) => setPartial(e.target.value)} placeholder="Ödənilən məbləğ ₼" /></div>}
      </div>
    </Modal>
  );
}

export function Invoice({ sale, onClose, onEdit }: { sale: Sale; onClose: () => void; onEdit?: () => void }) {
  const db = useDB();
  const remove = async () => {
    if (!await ask(`Faktura #${sale.no} silinsin? Mallar anbara qaytarılacaq.`)) return;
    update(`Faktura #${sale.no} silindi (${money(sale.total)})`, (d) => ({
      ...d,
      sales: d.sales.filter((x) => x.id !== sale.id),
      products: d.products.map((p) => {
        const back = sale.items.filter((i) => i.productId === p.id).reduce((s, i) => s + i.qty, 0);
        return back ? { ...p, qty: p.qty + back } : p;
      }),
    }));
    toast('Faktura silindi');
    onClose();
  };
  const c = db.customers.find((x) => x.id === sale.customerId);
  const products = new Map(db.products.map((p) => [p.id, p]));
  const text = [
    `${db.settings.companyName} — Faktura #${sale.no}`,
    `Tarix: ${fmtDate(sale.date)}`,
    `Müştəri: ${c?.shop}`,
    '',
    ...sale.items.map((i) => `${productName(products.get(i.productId)!)} × ${i.qty} = ${money(i.qty * i.price)}`),
    '',
    `Cəmi: ${money(sale.total)}`,
    `Ödənilib: ${money(sale.paid)}`,
    sale.total > sale.paid ? `Qalıq: ${money(sale.total - sale.paid)}` : '',
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
  return (
    <Modal open wide onClose={onClose} title={`Faktura #${sale.no}`} footer={<>
      {onEdit && <Button variant="dangerGhost" onClick={remove}><Trash2 className="size-4" /> Sil</Button>}
      {onEdit && <Button onClick={onEdit}><Pencil className="size-4" /> Redaktə</Button>}
      {c && <a href={waLink(c.phone, text)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-medium text-emerald-700"><MessageCircle className="size-4" /> WhatsApp</a>}
      {canPrint && <Button variant="dark" onClick={() => window.print()}><Printer className="size-4" /> Çap / PDF</Button>}
    </>}>
      <div id="print-area">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-bold">{db.settings.companyName}</div>
            <div className="text-sm text-slate-500">Topdan satış fakturası</div>
          </div>
          <div className="text-right text-sm"><div className="font-mono font-semibold">#{sale.no}</div><div className="text-slate-500">{fmtDate(sale.date)}</div></div>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><b>{c?.shop}</b><div className="text-slate-500">{c?.name} · {c?.phone}{c?.address ? ` · ${c.address}` : ''}</div></div>
        <table className="mt-4 w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Məhsul</th><th className="py-2 text-right">Say</th><th className="py-2 text-right">Qiymət</th><th className="py-2 text-right">Cəm</th></tr></thead>
          <tbody>
            {sale.items.map((i, k) => (
              <tr key={k} className="border-b border-slate-50">
                <td className="py-2">{productName(products.get(i.productId)!)}{i.imei && <div className="font-mono text-[11px] text-slate-400">IMEI: {i.imei}</div>}</td>
                <td className="tabular py-2 text-right">{i.qty}</td>
                <td className="tabular py-2 text-right">{money(i.price)}</td>
                <td className="tabular py-2 text-right font-medium">{money(i.qty * i.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 ml-auto max-w-56 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Cəmi</span><b className="tabular">{money(sale.total)}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Ödənilib</span><span className="tabular">{money(sale.paid)}</span></div>
          {sale.total > sale.paid && <div className="flex justify-between text-rose-600"><span>Qalıq</span><b className="tabular">{money(sale.total - sale.paid)}</b></div>}
        </div>
      </div>
    </Modal>
  );
}

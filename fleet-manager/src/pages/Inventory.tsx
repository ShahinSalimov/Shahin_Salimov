import { useState } from 'react';
import { Plus, PackagePlus, Trash2 } from 'lucide-react';
import { update, useDB } from '../lib/store';
import { fmtDate, money, num, today, uid } from '../lib/format';
import type { Product, ProductCategory, Purchase } from '../lib/types';
import { Badge, Button, Card, DataList, Field, Input, Modal, PageHeader, SearchBox, Select, Stat, Tabs, toast, ask } from '../components/ui';

export const productName = (p: Product) => `${p.brand === 'Generic' ? '' : p.brand + ' '}${p.model}${p.variant ? ' · ' + p.variant : ''}`;

export default function Inventory() {
  const db = useDB();
  const [tab, setTab] = useState<'all' | ProductCategory | 'low'>('all');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Product | 'new' | null>(null);
  const [receive, setReceive] = useState(false);

  const rows = db.products
    .filter((p) => (tab === 'all' ? true : tab === 'low' ? p.qty <= p.minQty : p.category === tab))
    .filter((p) => !q || productName(p).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.category.localeCompare(b.category) || productName(a).localeCompare(productName(b)));

  const value = db.products.reduce((s, p) => s + p.qty * p.cost, 0);
  const retail = db.products.reduce((s, p) => s + p.qty * p.price, 0);
  const phones = db.products.filter((p) => p.category === 'phone').reduce((s, p) => s + p.qty, 0);
  const acc = db.products.filter((p) => p.category === 'accessory').reduce((s, p) => s + p.qty, 0);
  const low = db.products.filter((p) => p.qty <= p.minQty).length;

  return (
    <>
      <PageHeader title="Anbar" subtitle="Telefon və aksesuarlar" actions={<>
        <Button onClick={() => setReceive(true)}><PackagePlus className="size-4" /> Mal qəbulu</Button>
        <Button variant="primary" onClick={() => setEdit('new')}><Plus className="size-4" /> Yeni məhsul</Button>
      </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Anbar dəyəri (maya)" value={money(value)} sub={`satış dəyəri ${money(retail)}`} />
        <Stat label="Potensial mənfəət" value={money(retail - value)} tone="green" />
        <Stat label="Telefon / aksesuar" value={`${num(phones)} / ${num(acc)}`} sub="ədəd" />
        <Stat label="Azalan məhsul" value={low} tone={low ? 'red' : 'slate'} sub="minimum həddə" onClick={() => setTab('low')} />
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={tab} onChange={setTab} items={[
          { value: 'all', label: 'Hamısı', count: db.products.length },
          { value: 'phone', label: 'Telefonlar', count: db.products.filter((p) => p.category === 'phone').length },
          { value: 'accessory', label: 'Aksesuarlar', count: db.products.filter((p) => p.category === 'accessory').length },
          { value: 'low', label: 'Azalanlar', count: low },
        ]} />
        <div className="mb-4"><SearchBox value={q} onChange={setQ} placeholder="Model axtar..." /></div>
      </div>
      <DataList
        rows={rows}
        onRow={(p) => setEdit(p)}
        columns={[
          { head: 'Məhsul', cell: (p) => <div className="font-medium">{productName(p)}</div> },
          { head: 'Növ', cell: (p) => <Badge tone={p.category === 'phone' ? 'blue' : 'violet'}>{p.category === 'phone' ? 'Telefon' : 'Aksesuar'}</Badge> },
          { head: 'Qalıq', cell: (p) => <span className={`tabular font-semibold ${p.qty === 0 ? 'text-rose-600' : p.qty <= p.minQty ? 'text-amber-600' : ''}`}>{num(p.qty)}</span>, className: 'text-right' },
          { head: 'Maya', cell: (p) => <span className="tabular">{money(p.cost)}</span>, className: 'text-right' },
          { head: 'Topdan qiymət', cell: (p) => <span className="tabular">{money(p.price)}</span>, className: 'text-right' },
          { head: 'Marja', cell: (p) => <span className="tabular text-emerald-600">{p.cost ? Math.round(((p.price - p.cost) / p.cost) * 100) : 0}%</span>, className: 'text-right' },
        ]}
        mobile={(p) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-semibold">{productName(p)}</div>
              <div className="text-xs text-slate-500">maya {money(p.cost)} · satış {money(p.price)}</div>
            </div>
            <div className={`tabular text-right text-lg font-bold ${p.qty === 0 ? 'text-rose-600' : p.qty <= p.minQty ? 'text-amber-600' : ''}`}>{num(p.qty)}<div className="text-[10px] font-normal text-slate-400">ədəd</div></div>
          </div>
        )}
      />
      {edit && <ProductForm product={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {receive && <ReceiveModal onClose={() => setReceive(false)} />}
      <PurchaseHistory />
    </>
  );
}

function PurchaseHistory() {
  const db = useDB();
  const [edit, setEdit] = useState<Purchase | null>(null);
  if (!db.purchases.length) return null;
  return (
    <Card className="mt-6 p-4 md:p-5">
      <div className="mb-3 font-semibold">Son mal qəbulları</div>
      {[...db.purchases].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((p) => (
        <button key={p.id} onClick={() => setEdit(p)} className="flex w-full justify-between border-b border-slate-50 py-2 text-left text-sm last:border-0 hover:bg-slate-50">
          <span>{p.supplier} <span className="text-slate-400">· {fmtDate(p.date)} · {p.items.reduce((s, i) => s + i.qty, 0)} ədəd</span></span>
          <b className="tabular">{money(p.total)}</b>
        </button>
      ))}
      {edit && <PurchaseEdit purchase={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function PurchaseEdit({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const db = useDB();
  const [supplier, setSupplier] = useState(purchase.supplier);
  const [date, setDate] = useState(purchase.date);
  const products = new Map(db.products.map((p) => [p.id, p]));
  const save = () => {
    update(`Mal qəbulu redaktə edildi: ${supplier}`, (d) => ({ ...d, purchases: d.purchases.map((x) => (x.id === purchase.id ? { ...x, supplier, date } : x)) }));
    onClose();
  };
  const remove = async () => {
    if (!await ask('Mal qəbulu silinsin? Mallar anbardan çıxılacaq.')) return;
    update(`Mal qəbulu silindi: ${purchase.supplier} ${money(purchase.total)}`, (d) => ({
      ...d,
      purchases: d.purchases.filter((x) => x.id !== purchase.id),
      products: d.products.map((p) => {
        const q = purchase.items.filter((i) => i.productId === p.id).reduce((s, i) => s + i.qty, 0);
        return q ? { ...p, qty: Math.max(0, p.qty - q) } : p;
      }),
    }));
    toast('Silindi');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Mal qəbulu" footer={<><Button variant="dangerGhost" onClick={remove}>Sil</Button><Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Yadda saxla</Button></>}>
      <div className="space-y-4">
        <Field label="Təchizatçı"><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field>
        <Field label="Tarix"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          {purchase.items.map((i, k) => {
            const p = products.get(i.productId);
            return <div key={k} className="flex justify-between py-0.5"><span>{p ? productName(p) : 'silinmiş məhsul'} × {i.qty}</span><span className="tabular">{money(i.qty * i.cost)}</span></div>;
          })}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-semibold"><span>Cəmi</span><span className="tabular">{money(purchase.total)}</span></div>
        </div>
        <div className="text-xs text-slate-400">Say və qiyməti dəyişmək üçün qəbulu silib yenidən daxil edin, ya da məhsulun qalığını birbaşa redaktə edin.</div>
      </div>
    </Modal>
  );
}

function ProductForm({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const db = useDB();
  const [f, setF] = useState<Product>(product ?? { id: uid(), category: 'phone', brand: '', model: '', variant: '', qty: 0, cost: 0, price: 0, minQty: 5 });
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () => {
    if (!f.model.trim()) return toast('Model daxil edin');
    update(product ? `Məhsul redaktə edildi: ${productName(f)}` : `Yeni məhsul: ${productName(f)}`, (d) => ({ ...d, products: product ? d.products.map((x) => (x.id === f.id ? f : x)) : [...d.products, f] }));
    toast('Yadda saxlanıldı');
    onClose();
  };
  const remove = async () => {
    if (!product) return;
    if (db.sales.some((s) => s.items.some((i) => i.productId === product.id))) return toast('Bu məhsul satışlarda istifadə olunub — silmək olmaz. Qalığı 0 edin.');
    if (!await ask(`${productName(product)} silinsin?`)) return;
    update(`Məhsul silindi: ${productName(product)}`, (d) => ({ ...d, products: d.products.filter((x) => x.id !== product.id) }));
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={product ? 'Məhsulu redaktə et' : 'Yeni məhsul'} footer={<>{product && <Button variant="dangerGhost" onClick={remove}>Sil</Button>}<Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Yadda saxla</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Növ"><Select value={f.category} onChange={(e) => set('category', e.target.value as ProductCategory)}><option value="phone">Telefon</option><option value="accessory">Aksesuar</option></Select></Field>
        <Field label="Marka"><Input value={f.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Apple, Samsung..." /></Field>
        <Field label="Model"><Input value={f.model} onChange={(e) => set('model', e.target.value)} /></Field>
        <Field label="Variant"><Input value={f.variant} onChange={(e) => set('variant', e.target.value)} placeholder="256GB / Qara" /></Field>
        <Field label="Maya dəyəri (₼)"><Input type="number" value={f.cost} onChange={(e) => set('cost', Number(e.target.value))} /></Field>
        <Field label="Topdan qiymət (₼)"><Input type="number" value={f.price} onChange={(e) => set('price', Number(e.target.value))} /></Field>
        <Field label="Qalıq (ədəd)" hint={product ? 'Düzəliş üçün. Adətən «Mal qəbulu» ilə artır.' : undefined}><Input type="number" value={f.qty} onChange={(e) => set('qty', Number(e.target.value))} /></Field>
        <Field label="Minimum qalıq" hint="Bu həddə çatanda xəbərdarlıq"><Input type="number" value={f.minQty} onChange={(e) => set('minQty', Number(e.target.value))} /></Field>
      </div>
    </Modal>
  );
}

function ReceiveModal({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState(today());
  const [lines, setLines] = useState<{ productId: string; qty: number; cost: number }[]>([{ productId: '', qty: 1, cost: 0 }]);
  const total = lines.reduce((s, l) => s + l.qty * l.cost, 0);
  const setLine = (i: number, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const save = () => {
    const valid = lines.filter((l) => l.productId && l.qty > 0);
    if (!valid.length) return toast('Ən azı bir məhsul seçin');
    update(`Mal qəbulu: ${supplier || 'təchizatçı'} — ${money(total)}`, (d) => ({
      ...d,
      products: d.products.map((p) => {
        const add = valid.filter((l) => l.productId === p.id);
        if (!add.length) return p;
        const q = add.reduce((s, l) => s + l.qty, 0);
        const c = add.reduce((s, l) => s + l.qty * l.cost, 0);
        const newQty = p.qty + q;
        return { ...p, qty: newQty, cost: Math.round(((p.qty * p.cost + c) / newQty) * 100) / 100 };
      }),
      purchases: [...d.purchases, { id: uid(), date, supplier: supplier || 'Naməlum', items: valid, total }],
    }));
    toast('Anbara əlavə edildi');
    onClose();
  };
  return (
    <Modal open wide onClose={onClose} title="Mal qəbulu" footer={<><Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Anbara əlavə et · {money(total)}</Button></>}>
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Field label="Təchizatçı"><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="məs. Dubai Trade" /></Field>
        <Field label="Tarix"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="space-y-3">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_90px_120px_auto]">
            <Select className="col-span-2 md:col-span-1" value={l.productId} onChange={(e) => { const p = db.products.find((x) => x.id === e.target.value); setLine(i, { productId: e.target.value, cost: p?.cost ?? 0 }); }}>
              <option value="">Məhsul seçin...</option>
              {db.products.map((p) => <option key={p.id} value={p.id}>{productName(p)}</option>)}
            </Select>
            <div className="col-span-2 grid grid-cols-2 gap-2 md:col-span-2">
              <Input type="number" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} placeholder="Say" />
              <Input type="number" value={l.cost} onChange={(e) => setLine(i, { cost: Number(e.target.value) })} placeholder="Maya ₼" />
            </div>
            <button className="text-slate-300 hover:text-rose-500 md:px-1" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Sil"><Trash2 className="size-4" /></button>
          </div>
        ))}
        <Button size="sm" onClick={() => setLines((ls) => [...ls, { productId: '', qty: 1, cost: 0 }])}><Plus className="size-4" /> Sətir əlavə et</Button>
      </div>
    </Modal>
  );
}

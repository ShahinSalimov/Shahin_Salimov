import { useState } from 'react';
import { Plus, Pencil, Settings2, X } from 'lucide-react';
import { update, useDB } from '../lib/store';
import { fmtDate, money, monthKey, monthName, today, uid } from '../lib/format';
import type { BizEntry, BusinessDef, PayMethod } from '../lib/types';
import { Badge, Button, DataList, Empty, Field, Input, Modal, PageHeader, Select, Stat, Tabs, toast } from '../components/ui';

export const bizColors = ['#8b5cf6', '#ec4899', '#10b981', '#f97316', '#06b6d4', '#ef4444', '#84cc16', '#6366f1'];

/** İstifadəçinin özü yaratdığı istənilən biznes üçün gəlir/xərc səhifəsi. */
export default function BusinessPage({ id }: { id: string }) {
  const db = useDB();
  const biz = db.businesses.find((b) => b.id === id);
  const [month, setMonth] = useState(monthKey(today()));
  const [tab, setTab] = useState<'all' | 'income' | 'expense'>('all');
  const [edit, setEdit] = useState<BizEntry | { kind: 'income' | 'expense' } | null>(null);
  const [cfg, setCfg] = useState(false);
  if (!biz) return <Empty text="Biznes tapılmadı" />;
  const all = db.entries.filter((e) => e.businessId === id);
  const months = [...new Set(all.map((e) => monthKey(e.date)).concat(monthKey(today())))].sort().reverse();
  const inMonth = all.filter((e) => monthKey(e.date) === month);
  const rows = inMonth.filter((e) => tab === 'all' || e.kind === tab).sort((a, b) => b.date.localeCompare(a.date));
  const income = inMonth.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount, 0);
  const expense = inMonth.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0);
  const todayIncome = all.filter((e) => e.kind === 'income' && e.date === today()).reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <PageHeader
        title={biz.name}
        subtitle={monthName(month)}
        actions={<>
          <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-40">{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</Select>
          <Button onClick={() => setCfg(true)}><Settings2 className="size-4" /> Ayarlar</Button>
        </>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bu gün gəlir" value={money(todayIncome)} tone="brand" />
        <Stat label="Ay üzrə gəlir" value={money(income)} tone="green" />
        <Stat label="Ay üzrə xərc" value={money(expense)} tone="red" />
        <Stat label="Xalis nəticə" value={money(income - expense)} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 md:flex">
        <Button variant="success" onClick={() => setEdit({ kind: 'income' })}><Plus className="size-4" /> Gəlir</Button>
        <Button variant="danger" onClick={() => setEdit({ kind: 'expense' })}><Plus className="size-4" /> Xərc</Button>
      </div>
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'all', label: 'Hamısı', count: inMonth.length },
        { value: 'income', label: 'Gəlir', count: inMonth.filter((e) => e.kind === 'income').length },
        { value: 'expense', label: 'Xərc', count: inMonth.filter((e) => e.kind === 'expense').length },
      ]} />
      <DataList
        rows={rows}
        empty="Hələ qeyd yoxdur. «Gəlir» və ya «Xərc» düyməsi ilə başlayın."
        onRow={(e) => setEdit(e)}
        columns={[
          { head: 'Tarix', cell: (e) => fmtDate(e.date) },
          { head: 'Növ', cell: (e) => <Badge tone={e.kind === 'income' ? 'green' : 'red'}>{e.kind === 'income' ? 'Gəlir' : 'Xərc'}</Badge> },
          { head: 'Kateqoriya', cell: (e) => e.category },
          { head: 'Qeyd', cell: (e) => <span className="text-slate-500">{e.note ?? ''}</span> },
          { head: 'Üsul', cell: (e) => (e.method === 'cash' ? 'Nağd' : 'Kart') },
          { head: 'Məbləğ', cell: (e) => <span className={`tabular font-semibold ${e.kind === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>{e.kind === 'income' ? '+' : '−'}{money(e.amount)}</span>, className: 'text-right' },
          { head: '', cell: () => <Pencil className="size-4 text-slate-300" /> },
        ]}
        mobile={(e) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><Badge tone={e.kind === 'income' ? 'green' : 'red'}>{e.kind === 'income' ? 'Gəlir' : 'Xərc'}</Badge><span className="truncate text-sm font-medium">{e.category}</span></div>
              <div className="mt-0.5 truncate text-xs text-slate-500">{fmtDate(e.date)}{e.note ? ` · ${e.note}` : ''}</div>
            </div>
            <div className={`tabular font-bold ${e.kind === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>{e.kind === 'income' ? '+' : '−'}{money(e.amount)}</div>
          </div>
        )}
      />
      {edit && <EntryForm biz={biz} entry={'id' in edit ? edit : null} kind={edit.kind} onClose={() => setEdit(null)} />}
      {cfg && <BusinessForm biz={biz} onClose={() => setCfg(false)} />}
    </>
  );
}

function EntryForm({ biz, entry, kind, onClose }: { biz: BusinessDef; entry: BizEntry | null; kind: 'income' | 'expense'; onClose: () => void }) {
  const cats = kind === 'income' ? biz.incomeCategories : biz.expenseCategories;
  const [f, setF] = useState<BizEntry>(entry ?? { id: uid(), businessId: biz.id, date: today(), kind, category: cats[0] ?? (kind === 'income' ? 'Satış' : 'Digər'), amount: 0, method: 'cash' });
  const set = <K extends keyof BizEntry>(k: K, v: BizEntry[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = () => {
    if (!f.amount) return toast('Məbləğ daxil edin');
    update(`${biz.name}: ${entry ? 'qeyd redaktə edildi' : f.kind === 'income' ? 'gəlir' : 'xərc'} — ${f.category} ${money(f.amount)}`, (d) => ({ ...d, entries: entry ? d.entries.map((x) => (x.id === f.id ? f : x)) : [...d.entries, f] }));
    toast('Yadda saxlanıldı');
    onClose();
  };
  const remove = () => {
    if (!entry || !confirm('Qeyd silinsin?')) return;
    update(`${biz.name}: qeyd silindi — ${entry.category} ${money(entry.amount)}`, (d) => ({ ...d, entries: d.entries.filter((x) => x.id !== entry.id) }));
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`${entry ? 'Redaktə' : f.kind === 'income' ? 'Yeni gəlir' : 'Yeni xərc'} — ${biz.name}`} footer={<>{entry && <Button variant="ghost" className="text-rose-600" onClick={remove}>Sil</Button>}<Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Yadda saxla</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Növ"><Select value={f.kind} onChange={(e) => set('kind', e.target.value as BizEntry['kind'])}><option value="income">Gəlir</option><option value="expense">Xərc</option></Select></Field>
        <Field label="Kateqoriya">
          <Input list="biz-cats" value={f.category} onChange={(e) => set('category', e.target.value)} />
          <datalist id="biz-cats">{(f.kind === 'income' ? biz.incomeCategories : biz.expenseCategories).map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Məbləğ (₼)"><Input type="number" inputMode="decimal" value={f.amount || ''} onChange={(e) => set('amount', Number(e.target.value))} autoFocus /></Field>
        <Field label="Tarix"><Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Üsul"><Select value={f.method} onChange={(e) => set('method', e.target.value as PayMethod)}><option value="cash">Nağd</option><option value="card">Kart / köçürmə</option></Select></Field>
        <Field label="Qeyd"><Input value={f.note ?? ''} onChange={(e) => set('note', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/** Yeni biznes yaratmaq və ya mövcud biznesin adını/kateqoriyalarını dəyişmək. */
export function BusinessForm({ biz, onClose }: { biz: BusinessDef | null; onClose: () => void }) {
  const db = useDB();
  const [f, setF] = useState<BusinessDef>(biz ?? {
    id: uid(), name: '', builtin: false, color: bizColors[db.businesses.length % bizColors.length],
    incomeCategories: ['Satış', 'Xidmət'], expenseCategories: ['İcarə', 'Maaş', 'Mal alışı', 'Kommunal', 'Digər'],
  });
  const [inc, setInc] = useState('');
  const [exp, setExp] = useState('');
  const save = () => {
    if (!f.name.trim()) return toast('Biznesin adını yazın');
    update(biz ? `Biznes redaktə edildi: ${f.name}` : `Yeni biznes əlavə edildi: ${f.name}`, (d) => ({ ...d, businesses: biz ? d.businesses.map((x) => (x.id === f.id ? f : x)) : [...d.businesses, f] }));
    toast('Yadda saxlanıldı');
    onClose();
    if (!biz) location.hash = `#/biz/${f.id}`;
  };
  const remove = () => {
    if (!biz || biz.builtin) return;
    const n = db.entries.filter((e) => e.businessId === biz.id).length;
    if (!confirm(`«${biz.name}» silinsin?${n ? ` ${n} qeyd də silinəcək.` : ''}`)) return;
    update(`Biznes silindi: ${biz.name}`, (d) => ({ ...d, businesses: d.businesses.filter((x) => x.id !== biz.id), entries: d.entries.filter((e) => e.businessId !== biz.id) }));
    location.hash = '#/settings';
    onClose();
  };
  const Chips = ({ list, onRemove }: { list: string[]; onRemove: (c: string) => void }) => (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {list.map((c) => (
        <span key={c} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-2.5 pr-1 text-xs">
          {c}<button onClick={() => onRemove(c)} className="rounded-full p-0.5 hover:bg-slate-200" aria-label="Sil"><X className="size-3" /></button>
        </span>
      ))}
    </div>
  );
  return (
    <Modal open onClose={onClose} title={biz ? `Biznes: ${biz.name}` : 'Yeni biznes əlavə et'} footer={<>{biz && !biz.builtin && <Button variant="ghost" className="text-rose-600" onClick={remove}>Sil</Button>}<Button onClick={onClose}>Ləğv</Button><Button variant="primary" onClick={save}>Yadda saxla</Button></>}>
      <div className="space-y-4">
        <Field label="Biznesin adı"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="məs. Avtoyuma, Kafe, Ehtiyat hissələri" autoFocus /></Field>
        <Field label="Rəng">
          <div className="flex gap-2">
            {bizColors.map((c) => <button key={c} onClick={() => setF({ ...f, color: c })} className={`size-8 rounded-full ring-offset-2 ${f.color === c ? 'ring-2 ring-ink' : ''}`} style={{ background: c }} aria-label={c} />)}
          </div>
        </Field>
        {!f.builtin && (
          <>
            <div>
              <Field label="Gəlir kateqoriyaları">
                <div className="flex gap-2"><Input value={inc} onChange={(e) => setInc(e.target.value)} placeholder="yeni kateqoriya" /><Button onClick={() => { if (inc.trim() && !f.incomeCategories.includes(inc.trim())) setF({ ...f, incomeCategories: [...f.incomeCategories, inc.trim()] }); setInc(''); }}>Əlavə</Button></div>
              </Field>
              <Chips list={f.incomeCategories} onRemove={(c) => setF({ ...f, incomeCategories: f.incomeCategories.filter((x) => x !== c) })} />
            </div>
            <div>
              <Field label="Xərc kateqoriyaları">
                <div className="flex gap-2"><Input value={exp} onChange={(e) => setExp(e.target.value)} placeholder="yeni kateqoriya" /><Button onClick={() => { if (exp.trim() && !f.expenseCategories.includes(exp.trim())) setF({ ...f, expenseCategories: [...f.expenseCategories, exp.trim()] }); setExp(''); }}>Əlavə</Button></div>
              </Field>
              <Chips list={f.expenseCategories} onRemove={(c) => setF({ ...f, expenseCategories: f.expenseCategories.filter((x) => x !== c) })} />
            </div>
          </>
        )}
        {f.builtin && <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Bu əsas modul olduğu üçün yalnız adını və rəngini dəyişmək olar.</div>}
      </div>
    </Modal>
  );
}

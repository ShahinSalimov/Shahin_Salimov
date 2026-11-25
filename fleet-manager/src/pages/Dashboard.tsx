import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Wallet, AlertTriangle, Car, TrendingUp, Package, Users, ChevronRight, Sun } from 'lucide-react';
import { useDB } from '../lib/store';
import { alerts, currentAssignments, customerDebts, dailyTaxiIncome, driverBalances, paidOn, saleProfit } from '../lib/calc';
import { addDays, fmtShort, money, monthKey, today } from '../lib/format';
import { Badge, Card, PageHeader, Stat } from '../components/ui';

export default function Dashboard() {
  const db = useDB();
  const d = useMemo(() => {
    const t = today();
    const { byDriver } = currentAssignments(db);
    const active = db.drivers.filter((x) => x.active && byDriver.has(x.id));
    const paidToday = paidOn(db, t);
    const collectedToday = [...paidToday.values()].reduce((s, v) => s + v, 0);
    const expectedToday = active.reduce((s, x) => s + (db.cars.find((c) => c.id === byDriver.get(x.id))?.dailyRate ?? 0), 0);
    const bal = driverBalances(db);
    const debt = active.reduce((s, x) => s + Math.max(0, bal.get(x.id) ?? 0), 0);
    const debtors = active.filter((x) => (bal.get(x.id) ?? 0) > 0).length;
    const m = monthKey(t);
    const taxiMonth = db.ledger.filter((l) => l.type === 'payment' && monthKey(l.date) === m).reduce((s, l) => s - l.amount, 0);
    const salesMonth = db.sales.filter((s) => monthKey(s.date) === m);
    const salesTotal = salesMonth.reduce((s, x) => s + x.total, 0);
    const salesProfit = salesMonth.reduce((s, x) => s + saleProfit(x), 0);
    const expMonth = db.expenses.filter((e) => monthKey(e.date) === m).reduce((s, e) => s + e.amount, 0);
    const stockValue = db.products.reduce((s, p) => s + p.qty * p.cost, 0);
    const custDebt = [...customerDebts(db).values()].reduce((s, v) => s + Math.max(0, v), 0);
    const chart = dailyTaxiIncome(db, 30).map((x) => ({ ...x, label: fmtShort(x.date) }));
    const weekAgo = addDays(t, -7);
    const salesChart = Array.from({ length: 30 }, (_, i) => {
      const date = addDays(t, i - 29);
      return { label: fmtShort(date), value: db.sales.filter((s) => s.date === date).reduce((s, x) => s + x.total, 0) };
    });
    return {
      active, collectedToday, expectedToday, paidCount: paidToday.size, debt, debtors, taxiMonth, salesTotal, salesProfit, expMonth,
      stockValue, custDebt, chart, salesChart, weekAgo,
      cars: { active: db.cars.filter((c) => c.status === 'active').length, service: db.cars.filter((c) => c.status === 'service').length, idle: db.cars.filter((c) => c.status === 'idle').length },
      alerts: alerts(db),
    };
  }, [db]);

  const pct = d.expectedToday ? Math.round((d.collectedToday / d.expectedToday) * 100) : 0;
  const net = d.taxiMonth + d.salesProfit - d.expMonth;

  return (
    <>
      <PageHeader
        title={`Salam, ${db.settings.ownerName}`}
        subtitle="Bütün biznesiniz bir ekranda"
        actions={<a href="#/morning" className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-white"><Sun className="size-4" /> Səhər hesabatı</a>}
      />

      {/* Bu günün əsas kartı */}
      <div className="mb-4 overflow-hidden rounded-2xl bg-ink p-5 text-white shadow-sm md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm text-slate-400">Bu gün yığılan (taksi)</div>
            <div className="tabular mt-1 text-4xl font-extrabold tracking-tight text-brand-400 md:text-5xl">{money(d.collectedToday)}</div>
            <div className="mt-1 text-sm text-slate-400">gözlənilən {money(d.expectedToday)} · {d.paidCount}/{d.active.length} sürücü ödəyib</div>
          </div>
          <div className="w-full md:w-72">
            <div className="mb-1.5 flex justify-between text-xs text-slate-400"><span>Plan icrası</span><span className="tabular font-semibold text-white">{pct}%</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-brand-400 transition-all" style={{ width: `${Math.min(100, pct)}%` }} /></div>
            <a href="#/payments" className="mt-4 flex items-center justify-center gap-1 rounded-xl bg-white/10 py-2.5 text-sm font-medium hover:bg-white/15">Ödəniş qəbul et <ChevronRight className="size-4" /></a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sürücü borcları" value={money(d.debt)} sub={`${d.debtors} sürücü`} tone="red" icon={<AlertTriangle className="size-5" />} onClick={() => (location.hash = '#/drivers?f=debt')} />
        <Stat label="Avtomobillər" value={`${d.cars.active} xəttdə`} sub={`${d.cars.service} servisdə · ${d.cars.idle} boş`} tone="brand" icon={<Car className="size-5" />} onClick={() => (location.hash = '#/cars')} />
        <Stat label="Telefon satışı (ay)" value={money(d.salesTotal)} sub={`mənfəət ${money(d.salesProfit)}`} tone="green" icon={<TrendingUp className="size-5" />} onClick={() => (location.hash = '#/sales')} />
        <Stat label="Anbar dəyəri" value={money(d.stockValue)} sub={`müştəri borcu ${money(d.custDebt)}`} icon={<Package className="size-5" />} onClick={() => (location.hash = '#/inventory')} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2 md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-semibold">Taksi gəliri — son 30 gün</div>
              <div className="text-xs text-slate-500">Bu ay: {money(d.taxiMonth)}</div>
            </div>
            <Wallet className="size-5 text-slate-400" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.chart} margin={{ left: -18, right: 4, top: 4 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#facc15" stopOpacity={0.5} /><stop offset="100%" stopColor="#facc15" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} interval={4} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => [money(v), 'Yığılan']} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Area isAnimationActive={false} type="monotone" dataKey="value" stroke="#ca8a04" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 md:p-5">
          <div className="mb-3 font-semibold">Bu ayın xülasəsi</div>
          <dl className="space-y-2.5 text-sm">
            <Row k="Taksi gəliri" v={money(d.taxiMonth)} />
            <Row k="Telefon mənfəəti" v={money(d.salesProfit)} />
            <Row k="Xərclər" v={money(-d.expMonth)} red />
            <div className="border-t border-slate-100 pt-2.5"><Row k="Xalis nəticə" v={money(net)} bold /></div>
          </dl>
          <div className="mt-4 h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.salesChart} margin={{ left: 0, right: 0, top: 4 }}>
                <Area isAnimationActive={false} type="monotone" dataKey="value" stroke="#059669" strokeWidth={2} fill="#05966922" />
                <Tooltip formatter={(v: number) => [money(v), 'Satış']} labelFormatter={(_, p) => p?.[0]?.payload?.label} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center text-xs text-slate-400">Telefon satışı, son 30 gün</div>
        </Card>
      </div>

      <Card className="mt-4 p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold">Diqqət tələb edənlər</div>
          <Badge tone={d.alerts.length ? 'red' : 'green'}>{d.alerts.length}</Badge>
        </div>
        {d.alerts.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">Hər şey qaydasındadır</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {d.alerts.slice(0, 12).map((a, i) => (
              <a key={i} href={a.link} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 text-sm hover:bg-slate-50">
                <span className={`size-2 shrink-0 rounded-full ${a.level === 'danger' ? 'bg-rose-500' : 'bg-amber-400'}`} />
                <span className="flex-1 truncate">{a.text}</span>
                <Badge tone={a.kind === 'debt' ? 'red' : a.kind === 'stock' ? 'violet' : a.kind === 'oil' ? 'blue' : 'amber'}>
                  {{ debt: 'Borc', stock: 'Anbar', oil: 'Yağ', insurance: 'Sığorta', inspection: 'Texbaxış' }[a.kind]}
                </Badge>
              </a>
            ))}
          </div>
        )}
        {d.alerts.length > 12 && <div className="mt-2 text-center text-xs text-slate-400">+{d.alerts.length - 12} xəbərdarlıq daha</div>}
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 md:hidden">
        <a href="#/drivers" className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium"><Users className="size-5 text-slate-500" /> Sürücülər</a>
        <a href="#/inventory" className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium"><Package className="size-5 text-slate-500" /> Anbar</a>
      </div>
    </>
  );
}

function Row({ k, v, red, bold }: { k: string; v: string; red?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{k}</dt>
      <dd className={`tabular ${bold ? 'text-base font-bold' : 'font-medium'} ${red ? 'text-rose-600' : ''}`}>{v}</dd>
    </div>
  );
}

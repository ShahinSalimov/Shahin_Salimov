import type { ReactNode } from 'react';
import { LayoutDashboard, Wallet, Car, Users, ShieldAlert, Wrench, Package, ShoppingCart, Store, Landmark, BarChart3, Sun, Settings, Menu, Briefcase, Plus } from 'lucide-react';
import type { DB } from '../lib/types';
import { useDB } from '../lib/store';
import { cls } from '../lib/format';

export const baseNav = [
  { group: 'Ümumi', items: [
    { to: '', label: 'Panel', icon: LayoutDashboard },
    { to: 'morning', label: 'Səhər hesabatı', icon: Sun },
    { to: 'cash', label: 'Kassa', icon: Landmark },
    { to: 'reports', label: 'Hesabatlar', icon: BarChart3 },
  ] },
  { group: 'taxi', items: [
    { to: 'payments', label: 'Gündəlik ödəniş', icon: Wallet },
    { to: 'cars', label: 'Avtomobillər', icon: Car },
    { to: 'drivers', label: 'Sürücülər', icon: Users },
    { to: 'fines', label: 'Cərimələr', icon: ShieldAlert },
    { to: 'expenses', label: 'Xərclər və servis', icon: Wrench },
  ] },
  { group: 'phone', items: [
    { to: 'inventory', label: 'Anbar', icon: Package },
    { to: 'sales', label: 'Satış', icon: ShoppingCart },
    { to: 'customers', label: 'Müştərilər', icon: Store },
  ] },
  { group: 'Sistem', items: [{ to: 'settings', label: 'Ayarlar', icon: Settings }] },
];

const mobileNav = [
  { to: '', label: 'Panel', icon: LayoutDashboard },
  { to: 'payments', label: 'Ödəniş', icon: Wallet },
  { to: 'cars', label: 'Maşınlar', icon: Car },
  { to: 'sales', label: 'Satış', icon: ShoppingCart },
  { to: 'more', label: 'Menyu', icon: Menu },
];

/** Əsas menyu + istifadəçinin əlavə etdiyi bizneslər */
export function buildNav(db: DB) {
  const name = (id: string) => db.businesses.find((b) => b.id === id)?.name ?? id;
  const groups = baseNav.map((g) => ({ ...g, group: g.group === 'taxi' || g.group === 'phone' ? name(g.group) : g.group }));
  const custom = db.businesses.filter((b) => !b.builtin);
  groups.splice(3, 0, {
    group: 'Digər bizneslər',
    items: [
      ...custom.map((b) => ({ to: `biz/${b.id}`, label: b.name, icon: Briefcase, color: b.color })),
      { to: 'settings?new=biz', label: 'Yeni biznes', icon: Plus },
    ],
  });
  return groups as { group: string; items: { to: string; label: string; icon: typeof Plus; color?: string }[] }[];
}

function isActive(route: string, to: string) {
  const path = route.split('?')[0];
  const top = path.split('/')[0];
  if (to.startsWith('biz/')) return path === to;
  if (to.includes('?')) return false;
  return to === '' ? top === '' : top === to;
}

export function Logo({ dark }: { dark?: boolean }) {
  const { settings } = useDB();
  return (
    <div className="flex items-center gap-2.5">
      {settings.logo ? (
        <img src={settings.logo} alt="" className="size-9 rounded-xl bg-white object-contain" />
      ) : (
        <img src="./icon.svg" alt="" className="size-9 rounded-xl" />
      )}
      <div className="leading-tight">
        <div className={cls('text-sm font-bold', dark ? 'text-white' : 'text-ink')}>{settings.companyName}</div>
        <div className={cls('text-[11px]', dark ? 'text-slate-400' : 'text-slate-500')}>İdarəetmə sistemi</div>
      </div>
    </div>
  );
}

export function Layout({ route, children }: { route: string; children: ReactNode }) {
  const db = useDB();
  const { settings } = db;
  const nav = buildNav(db);
  return (
    <div className="min-h-full md:flex">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink px-3 py-5 md:flex">
        <div className="px-2 pb-6"><Logo dark /></div>
        <nav className="flex-1 space-y-5 overflow-y-auto">
          {nav.map((g) => (
            <div key={g.group}>
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.group}</div>
              {g.items.map((i) => (
                <a
                  key={i.to}
                  href={`#/${i.to}`}
                  className={cls('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition', isActive(route, i.to) ? 'bg-brand-400 text-ink' : 'text-slate-300 hover:bg-white/5 hover:text-white')}
                >
                  {i.color ? <span className="grid size-[18px] place-items-center"><span className="size-2.5 rounded-full" style={{ background: i.color }} /></span> : <i.icon className="size-[18px]" />}
                  <span className="truncate">{i.label}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-4 rounded-xl bg-white/5 px-3 py-2.5 text-xs text-slate-400">
          Daxil olan: <span className="font-semibold text-white">{settings.currentUser}</span>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
          <Logo />
          <a href="#/settings" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{settings.currentUser}</a>
        </header>
        <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>
      </div>

      <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white md:hidden">
        {mobileNav.map((i) => {
          const active = isActive(route, i.to) || (i.to === 'more' && !mobileNav.some((m) => m.to !== 'more' && isActive(route, m.to)));
          return (
            <a key={i.to} href={`#/${i.to}`} className={cls('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', active ? 'text-ink' : 'text-slate-400')}>
              <span className={cls('grid h-7 w-12 place-items-center rounded-full transition', active && 'bg-brand-300')}>
                <i.icon className="size-5" />
              </span>
              {i.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

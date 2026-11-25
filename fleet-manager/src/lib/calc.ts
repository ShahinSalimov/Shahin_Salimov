import type { Car, DB, Driver, ID } from './types';
import { addDays, daysBetween, fmtDate, money, today } from './format';

export function driverBalances(db: DB): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const l of db.ledger) m.set(l.driverId, (m.get(l.driverId) ?? 0) + l.amount);
  return m;
}

export function currentAssignments(db: DB) {
  const byCar = new Map<ID, ID>();
  const byDriver = new Map<ID, ID>();
  for (const a of db.assignments) {
    if (a.to === null) {
      byCar.set(a.carId, a.driverId);
      byDriver.set(a.driverId, a.carId);
    }
  }
  return { byCar, byDriver };
}

/** Verilən tarix-saatda maşın kimdə olub (cərimələr üçün). */
export function driverAt(db: DB, carId: ID, date: string): ID | null {
  const d = date.slice(0, 10);
  const a = db.assignments.find((x) => x.carId === carId && x.from <= d && (x.to === null || x.to >= d));
  return a?.driverId ?? null;
}

export type Rating = 'gold' | 'silver' | 'red' | 'new';

export function driverRatings(db: DB): Map<ID, { rating: Rating; ratio: number }> {
  const from = addDays(today(), -30);
  const charged = new Map<ID, number>();
  const paid = new Map<ID, number>();
  for (const l of db.ledger) {
    if (l.date < from) continue;
    if (l.type === 'rent') charged.set(l.driverId, (charged.get(l.driverId) ?? 0) + l.amount);
    if (l.type === 'payment') paid.set(l.driverId, (paid.get(l.driverId) ?? 0) - l.amount);
  }
  const out = new Map<ID, { rating: Rating; ratio: number }>();
  for (const d of db.drivers) {
    const c = charged.get(d.id) ?? 0;
    if (c < 200) {
      out.set(d.id, { rating: 'new', ratio: 1 });
      continue;
    }
    const ratio = Math.min(1, (paid.get(d.id) ?? 0) / c);
    out.set(d.id, { rating: ratio >= 0.95 ? 'gold' : ratio >= 0.82 ? 'silver' : 'red', ratio });
  }
  return out;
}

export function paidOn(db: DB, date: string): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const l of db.ledger) if (l.type === 'payment' && l.date === date) m.set(l.driverId, (m.get(l.driverId) ?? 0) - l.amount);
  return m;
}

export function dailyTaxiIncome(db: DB, days: number) {
  const start = addDays(today(), -(days - 1));
  const map = new Map<string, number>();
  for (let i = 0; i < days; i++) map.set(addDays(start, i), 0);
  for (const l of db.ledger) if (l.type === 'payment' && map.has(l.date)) map.set(l.date, map.get(l.date)! - l.amount);
  return [...map.entries()].map(([date, value]) => ({ date, value }));
}

export function saleProfit(s: DB['sales'][number]) {
  return s.items.reduce((sum, i) => sum + (i.price - i.cost) * i.qty, 0);
}

export function customerDebts(db: DB): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const s of db.sales) m.set(s.customerId, (m.get(s.customerId) ?? 0) + s.total - s.paid);
  for (const p of db.customerPayments) m.set(p.customerId, (m.get(p.customerId) ?? 0) - p.amount);
  return m;
}

export interface Alert {
  level: 'danger' | 'warn' | 'info';
  kind: 'insurance' | 'inspection' | 'oil' | 'stock' | 'debt';
  text: string;
  link: string;
}

export function alerts(db: DB): Alert[] {
  const t = today();
  const out: Alert[] = [];
  for (const c of db.cars) {
    const ins = daysBetween(t, c.insuranceUntil);
    if (ins <= 7) out.push({ level: ins < 0 ? 'danger' : 'warn', kind: 'insurance', text: `${c.plate} — sığorta ${ins < 0 ? `${-ins} gün əvvəl bitib` : ins === 0 ? 'bu gün bitir' : `${ins} gün sonra bitir`}`, link: `#/cars/${c.id}` });
    const insp = daysBetween(t, c.inspectionUntil);
    if (insp <= 7) out.push({ level: insp < 0 ? 'danger' : 'warn', kind: 'inspection', text: `${c.plate} — texbaxış ${insp < 0 ? `${-insp} gün gecikib` : insp === 0 ? 'bu gündür' : `${insp} gün sonra`}`, link: `#/cars/${c.id}` });
    const km = c.mileage - c.lastOilKm;
    if (km >= c.oilIntervalKm - 500) out.push({ level: km >= c.oilIntervalKm ? 'danger' : 'warn', kind: 'oil', text: `${c.plate} — yağ dəyişməsi (${Math.round(km)} km keçib)`, link: `#/cars/${c.id}` });
  }
  for (const p of db.products) if (p.qty <= p.minQty) out.push({ level: p.qty === 0 ? 'danger' : 'warn', kind: 'stock', text: `${p.brand === 'Generic' ? '' : p.brand + ' '}${p.model} ${p.variant} — ${p.qty} ədəd qalıb`, link: '#/inventory' });
  const bal = driverBalances(db);
  for (const d of db.drivers) {
    const b = bal.get(d.id) ?? 0;
    if (d.active && b > d.debtLimit) out.push({ level: 'danger', kind: 'debt', text: `${d.name} — borc ${money(b)} (limit ${money(d.debtLimit)})`, link: `#/drivers/${d.id}` });
  }
  const order = { danger: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** Bir avtomobilin gəlir/xərc/mənfəət hesabatı (bütün dövr). */
export function carProfit(db: DB) {
  const income = new Map<ID, number>();
  const cost = new Map<ID, number>();
  for (const l of db.ledger) if (l.type === 'payment' && l.carId) income.set(l.carId, (income.get(l.carId) ?? 0) - l.amount);
  for (const e of db.expenses) if (e.carId) cost.set(e.carId, (cost.get(e.carId) ?? 0) + e.amount);
  return db.cars.map((c) => ({ car: c, income: income.get(c.id) ?? 0, cost: cost.get(c.id) ?? 0, profit: (income.get(c.id) ?? 0) - (cost.get(c.id) ?? 0) }));
}

export const carLabel = (c: Car) => `${c.plate} · ${c.make} ${c.model}`;
export const ratingLabel: Record<Rating, string> = { gold: 'Qızıl', silver: 'Gümüş', red: 'Riskli', new: 'Yeni' };

export function morningReport(db: DB): string {
  const t = today();
  const y = addDays(t, -1);
  const paidY = paidOn(db, y);
  const { byDriver } = currentAssignments(db);
  const activeDrivers = db.drivers.filter((d) => d.active && byDriver.has(d.id));
  const collected = [...paidY.values()].reduce((s, v) => s + v, 0);
  const unpaid = activeDrivers.filter((d) => !paidY.has(d.id));
  const bal = driverBalances(db);
  const totalDebt = activeDrivers.reduce((s, d) => s + Math.max(0, bal.get(d.id) ?? 0), 0);
  const salesY = db.sales.filter((s) => s.date === y);
  const salesTotal = salesY.reduce((s, x) => s + x.total, 0);
  const profitY = salesY.reduce((s, x) => s + saleProfit(x), 0);
  const al = alerts(db);
  const topDebt = activeDrivers
    .map((d) => [d, bal.get(d.id) ?? 0] as [Driver, number])
    .filter(([, b]) => b > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const lines = [
    `Sabahınız xeyir, ${db.settings.ownerName}!`,
    `${db.settings.companyName} — ${fmtDate(y)} hesabatı`,
    '',
    'TAKSİ PARKI',
    `• Yığılan: ${money(collected)}`,
    `• Ödəməyən sürücü: ${unpaid.length} nəfər`,
    `• Ümumi sürücü borcu: ${money(totalDebt)}`,
    `• Xəttdə: ${db.cars.filter((c) => c.status === 'active').length} maşın, servisdə: ${db.cars.filter((c) => c.status === 'service').length}`,
    '',
    'TELEFON TOPDAN',
    `• Satış: ${money(salesTotal)} (${salesY.length} faktura)`,
    `• Mənfəət: ${money(profitY)}`,
    '',
  ];
  if (topDebt.length) {
    lines.push('ƏN ÇOX BORCU OLANLAR');
    topDebt.forEach(([d, b]) => lines.push(`• ${d.name} — ${money(b)}`));
    lines.push('');
  }
  const crit = al.filter((a) => a.kind !== 'debt').slice(0, 6);
  if (crit.length) {
    lines.push('DİQQƏT');
    crit.forEach((a) => lines.push(`• ${a.text}`));
  }
  return lines.join('\n');
}

export function waLink(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`;
}

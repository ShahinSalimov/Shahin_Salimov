export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Yerli vaxtla YYYY-MM-DD */
export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const today = () => toISO(new Date());

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00').getTime();
  const db = new Date(b + 'T12:00:00').getTime();
  return Math.round((db - da) / 86400000);
}

const months = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];

export function fmtDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

export function fmtShort(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)} ${months[Number(m) - 1]}`;
}

export function money(n: number, withSign = false): string {
  // böyük məbləğlərdə qəpik göstərilmir — oxunaqlı olsun
  const v = Math.abs(n) >= 1000 ? Math.round(n) : Math.round(n * 100) / 100;
  const s = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 }).replace(/,/g, ' ');
  const sign = v < 0 ? '−' : withSign && v > 0 ? '+' : '';
  return `${sign}${s} ₼`;
}

export function num(n: number): string {
  return Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
}

export function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export function monthName(key: string) {
  const full = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
  const [y, m] = key.split('-');
  return `${full[Number(m) - 1]} ${y}`;
}

export function cls(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

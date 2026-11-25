/**
 * Demo rejimi: `VITE_DEMO=1` ilə build ediləndə aktivdir.
 * Sınaq müddəti hər cihazda ilk açılışdan sayılır (VITE_DEMO_HOURS, standart 48 saat).
 * VITE_DEMO_UNTIL (YYYY-MM-DD) verilərsə, bu tarixdən sonra hər halda bağlanır.
 */
const env = import.meta.env;
export const DEMO = env.VITE_DEMO === '1';
export const DEMO_HOURS = Number(env.VITE_DEMO_HOURS || 48);
export const DEMO_CONTACT_NAME: string = env.VITE_DEMO_CONTACT_NAME || 'Şahin Səlimov';
export const DEMO_CONTACT_PHONE: string = env.VITE_DEMO_CONTACT_PHONE || '';
const UNTIL: string = env.VITE_DEMO_UNTIL || '';
const KEY = 'parkpro-demo-start';

function startTime(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (v) return v;
    const now = Date.now();
    localStorage.setItem(KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

export function demoState() {
  const start = startTime();
  let end = start + DEMO_HOURS * 3600_000;
  if (UNTIL) end = Math.min(end, new Date(UNTIL + 'T23:59:59').getTime());
  const left = end - Date.now();
  return { left, expired: left <= 0 };
}

export function fmtLeft(ms: number) {
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return h > 0 ? `${h} saat ${m} dəq` : `${m} dəq`;
}

export const contactLink = () =>
  DEMO_CONTACT_PHONE
    ? `https://wa.me/${DEMO_CONTACT_PHONE.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Salam, Park Pro idarəetmə sistemi ilə maraqlanıram.')}`
    : '';

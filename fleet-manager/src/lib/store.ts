import { useSyncExternalStore } from 'react';
import type { DB } from './types';
import { addDays, today, uid } from './format';
import { createSeed, defaultBusinesses } from './seed';

const KEY = 'parkpro-db-v1';
const DB_VERSION = 1;

let state: DB = load();
const listeners = new Set<() => void>();

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.version === DB_VERSION) {
        // köhnə saxlanmış data üçün yeni sahələri tamamla
        if (!parsed.businesses) parsed.businesses = defaultBusinesses();
        if (!parsed.entries) parsed.entries = [];
        return accrueRent(parsed);
      }
    }
  } catch {
    /* korlanmış data: yenidən seed */
  }
  return accrueRent(createSeed());
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Yadda saxlamaq alınmadı', e);
  }
}

/**
 * Aktiv icarələr üçün hər gün avtomatik icarə haqqı (borc) yazır.
 * Son hesablanma tarixindən bu günə qədər işləyir, təkrar yazmır.
 */
export function accrueRent(db: DB, upTo = today()): DB {
  const start = db.lastAccrual ? addDays(db.lastAccrual, 1) : null;
  if (start && start > upTo) return db;
  const carMap = new Map(db.cars.map((c) => [c.id, c]));
  const existing = new Set(db.ledger.filter((l) => l.type === 'rent').map((l) => `${l.driverId}|${l.date}`));
  const add: DB['ledger'] = [];
  for (const a of db.assignments) {
    const car = carMap.get(a.carId);
    if (!car) continue;
    let d = start && start > a.from ? start : a.from;
    const end = a.to && a.to < upTo ? a.to : upTo;
    while (d <= end) {
      const k = `${a.driverId}|${d}`;
      if (!existing.has(k) && (a.to !== null || car.status === 'active')) {
        existing.add(k);
        add.push({ id: uid(), driverId: a.driverId, carId: a.carId, date: d, type: 'rent', amount: car.dailyRate });
      }
      d = addDays(d, 1);
    }
  }
  return { ...db, ledger: add.length ? [...db.ledger, ...add] : db.ledger, lastAccrual: upTo };
}

export function getDB() {
  return state;
}

export function useDB(): DB {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

/** Bütün dəyişikliklər buradan keçir və audit jurnalına yazılır. */
export function update(action: string, fn: (db: DB) => DB) {
  const next = fn(state);
  const entry = { id: uid(), ts: new Date().toISOString(), user: next.settings.currentUser, action };
  state = { ...next, audit: [entry, ...next.audit].slice(0, 1000) };
  persist();
  listeners.forEach((l) => l());
}

export function replaceDB(db: DB, action: string) {
  state = accrueRent(db);
  update(action, (d) => d);
}

export function resetDemo() {
  replaceDB(createSeed(), 'Demo məlumatları yenidən yükləndi');
}

export function clearAll() {
  const empty = createSeed(true);
  replaceDB(empty, 'Bütün məlumatlar silindi (təmiz başlanğıc)');
}

// Gün dəyişəndə (tətbiq açıq qalıbsa) icarəni yenidən hesabla
setInterval(() => {
  if (state.lastAccrual !== today()) {
    state = accrueRent(state);
    persist();
    listeners.forEach((l) => l());
  }
}, 60_000);

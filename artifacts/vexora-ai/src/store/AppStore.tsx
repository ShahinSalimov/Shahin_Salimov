import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BillingCycle, CheckoutItem, GenerationResult, PlanId, Route } from '@/types';
import { getPlan } from '@/data/pricing';

interface AppState {
  route: Route;
  navigate: (r: Route) => void;
  credits: number;
  spendCredits: (n: number) => boolean;
  addCredits: (n: number) => void;
  planId: PlanId;
  cycle: BillingCycle;
  setPlan: (id: PlanId, cycle: BillingCycle) => void;
  checkout: CheckoutItem | null;
  openCheckout: (item: CheckoutItem) => void;
  closeCheckout: () => void;
  library: GenerationResult[];
  addToLibrary: (r: GenerationResult[]) => void;
  remixPrompt: string | null;
  remix: (prompt: string) => void;
  consumeRemix: () => string | null;
}

const Ctx = createContext<AppState | null>(null);
const ROUTES: Route[] = ['explore', 'create', 'pricing', 'profile'];
/** Accepts both `#create` (canonical) and legacy `#/create`. */
const readHash = (): Route => {
  const h = window.location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(h) ? h : 'explore';
};

function usePersisted<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }, [key, v]);
  return [v, setV] as const;
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(readHash);
  const [credits, setCredits] = usePersisted('vx.credits', getPlan('free').creditsPerMonth);
  const [planId, setPlanId] = usePersisted<PlanId>('vx.plan', 'free');
  const [cycle, setCycle] = usePersisted<BillingCycle>('vx.cycle', 'monthly');
  const [library, setLibrary] = usePersisted<GenerationResult[]>('vx.library', []);
  const [checkout, setCheckout] = useState<CheckoutItem | null>(null);
  const [remixPrompt, setRemixPrompt] = useState<string | null>(null);

  useEffect(() => {
    const on = () => { setRoute(readHash()); setCheckout(null); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const navigate = useCallback((r: Route) => { window.location.hash = r; window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const spendCredits = useCallback((n: number) => {
    if (credits < n) return false;
    setCredits((c) => c - n);
    return true;
  }, [credits, setCredits]);

  const value = useMemo<AppState>(() => ({
    route, navigate, credits, spendCredits,
    addCredits: (n) => setCredits((c) => c + n),
    planId, cycle,
    setPlan: (id, cy) => { setPlanId(id); setCycle(cy); },
    checkout, openCheckout: setCheckout, closeCheckout: () => setCheckout(null),
    library, addToLibrary: (r) => setLibrary((l) => [...r, ...l].slice(0, 60)),
    remixPrompt,
    remix: (p) => { setRemixPrompt(p); navigate('create'); },
    consumeRemix: () => { const p = remixPrompt; setRemixPrompt(null); return p; },
  }), [route, navigate, credits, spendCredits, setCredits, planId, cycle, setPlanId, setCycle, checkout, library, setLibrary, remixPrompt]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppStoreProvider');
  return v;
}

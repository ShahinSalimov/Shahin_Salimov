import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { currencyForLocale, isCurrency, type CheckoutItem, type Currency, type Me, type PublicConfig } from '@workspace/vexora-core';
import { backend } from '@/services/backend';
import { useI18n } from '@/i18n';
import { ROUTES, type Route } from '@/types';

type AuthMode = 'signin' | 'signup';

interface AppState {
  route: Route;
  navigate: (r: Route) => void;
  config: PublicConfig | null;
  /** undefined while the session is loading, null when signed out */
  me: Me | null | undefined;
  refreshMe: () => Promise<void>;
  setMe: (m: Me | null) => void;
  signOut: () => Promise<void>;
  auth: AuthMode | null;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  checkout: CheckoutItem | null;
  openCheckout: (item: CheckoutItem) => void;
  closeCheckout: () => void;
  remixPrompt: string | null;
  remix: (prompt: string) => void;
  consumeRemix: () => string | null;
}

const Ctx = createContext<AppState | null>(null);

/** Gateways send customers back to real paths (SUCCESS_URL / ERROR_URL), e.g. /payment/success?order_id=… */
const PATH_ROUTES: [RegExp, Route][] = [
  [/\/payment\/success\/?$/, 'payment-success'],
  [/\/payment\/failed\/?$/, 'payment-failed'],
  [/\/payment\/sandbox\/?$/, 'payment-sandbox'],
];
const PATH_ROUTE_RE = /\/payment\/(success|failed|sandbox)\/?$/;

/** Hash wins (`#create`, legacy `#/create`); otherwise a payment path; otherwise Explore. */
const readRoute = (): Route => {
  const h = window.location.hash.replace(/^#\/?/, '') as Route;
  if ((ROUTES as readonly string[]).includes(h)) return h;
  return PATH_ROUTES.find(([re]) => re.test(window.location.pathname))?.[1] ?? 'explore';
};

const CURRENCY_KEY = 'vx.currency';
function initialCurrency(locale: string): Currency {
  try { const c = localStorage.getItem(CURRENCY_KEY); if (isCurrency(c)) return c; } catch { /* ignore */ }
  const region = (navigator.language ?? '').split('-')[1];
  return currencyForLocale(locale, region);
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const [route, setRoute] = useState<Route>(readRoute);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [auth, setAuth] = useState<AuthMode | null>(null);
  const [currency, setCurrencyState] = useState<Currency>(() => initialCurrency(locale));
  const [checkout, setCheckout] = useState<CheckoutItem | null>(null);
  const [remixPrompt, setRemixPrompt] = useState<string | null>(null);

  useEffect(() => {
    const on = () => { setRoute(readRoute()); setCheckout(null); };
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('popstate', on); };
  }, []);

  const refreshMe = useCallback(async () => {
    try { setMe(await backend.me()); } catch { setMe(null); }
  }, []);

  useEffect(() => {
    void refreshMe();
    backend.config().then(setConfig).catch(() => setConfig(null));
  }, [refreshMe]);

  const navigate = useCallback((r: Route) => {
    const { pathname, search } = window.location;
    if (PATH_ROUTE_RE.test(pathname)) {
      // Leaving /payment/... : go back to the app root without a reload.
      window.history.pushState(null, '', `${pathname.replace(PATH_ROUTE_RE, '/')}#${r}`);
      setRoute(r); setCheckout(null);
    } else {
      if (search.includes('order_id')) window.history.replaceState(null, '', pathname + window.location.hash);
      window.location.hash = r;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    try { localStorage.setItem(CURRENCY_KEY, c); } catch { /* ignore */ }
  }, []);

  const value = useMemo<AppState>(() => ({
    route, navigate, config, me, refreshMe, setMe,
    signOut: async () => { await backend.logout().catch(() => undefined); setMe(null); navigate('explore'); },
    auth, openAuth: (mode = 'signin') => setAuth(mode), closeAuth: () => setAuth(null),
    currency, setCurrency,
    checkout,
    // Buying needs an account: ask to sign in first, then the user picks the plan again.
    openCheckout: (item) => (me ? setCheckout(item) : setAuth('signup')),
    closeCheckout: () => setCheckout(null),
    remixPrompt,
    remix: (p) => { setRemixPrompt(p); navigate('create'); },
    consumeRemix: () => { const p = remixPrompt; setRemixPrompt(null); return p; },
  }), [route, navigate, config, me, refreshMe, auth, currency, setCurrency, checkout, remixPrompt]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppStoreProvider');
  return v;
}

/** Credits shown in the UI (0 when signed out). */
export const useCredits = () => useApp().me?.balance ?? 0;

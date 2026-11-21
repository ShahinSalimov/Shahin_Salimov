import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from './config';
import { DICTS } from './locales';
import type { Dict, TKey, Vars } from './types';

const STORAGE_KEY = 'vx.locale';

function lookup(dict: Dict, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) cur = (cur as Record<string, unknown> | undefined)?.[part];
  return typeof cur === 'string' ? cur : undefined;
}
const interpolate = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

/** First supported language from the browser's preference list ("de-AT" → "de"), if any. */
export function detectBrowserLocale(langs: readonly string[] = navigator.languages ?? [navigator.language]): Locale | null {
  for (const tag of langs) {
    const base = tag?.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return null;
}

/** Initial locale: ?lang= URL param → user's saved choice → browser language → English. */
function initialLocale(): Locale {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (isLocale(q)) return q;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch { /* storage unavailable */ }
  return detectBrowserLocale() ?? DEFAULT_LOCALE;
}

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TKey, vars?: Vars) => string;
  fmt: { usd: (n: number) => string; num: (n: number) => string; compact: (n: number) => string };
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const value = useMemo<I18n>(() => {
    const dict = DICTS[locale];
    const fallback = DICTS[DEFAULT_LOCALE];
    const intl = LOCALES[locale].intl;
    const money = (n: number) => new Intl.NumberFormat(intl, { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
    return {
      locale,
      setLocale,
      t: (key, vars) => interpolate(lookup(dict, key) ?? lookup(fallback, key) ?? key, vars),
      fmt: {
        usd: money,
        num: (n) => new Intl.NumberFormat(intl).format(n),
        compact: (n) => new Intl.NumberFormat(intl, { notation: 'compact' }).format(n),
      },
    };
  }, [locale, setLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = value.t('meta.title');
    document.querySelector('meta[name="description"]')?.setAttribute('content', value.t('meta.description'));
  }, [locale, value]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside I18nProvider');
  return v;
}

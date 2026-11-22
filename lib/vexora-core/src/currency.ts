/** Currencies the storefront can price and charge in. All amounts are integers in minor units (cents, qəpik, kuruş, pence). */
export const CURRENCIES = ['USD', 'EUR', 'AZN', 'TRY', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = 'USD';

export const isCurrency = (v: unknown): v is Currency => typeof v === 'string' && (CURRENCIES as readonly string[]).includes(v);

/** Suggested currency for a UI locale (user can always switch). */
export function currencyForLocale(locale: string, region?: string): Currency {
  if (region?.toUpperCase() === 'GB') return 'GBP';
  switch (locale) {
    case 'az': return 'AZN';
    case 'tr': return 'TRY';
    case 'de': case 'es': case 'fr': return 'EUR';
    default: return 'USD';
  }
}

export const toMinor = (major: number) => Math.round(major * 100);
export const toMajor = (minor: number) => minor / 100;

import { toMinor, type Currency } from './currency';

export type PlanId = 'free' | 'starter' | 'creator' | 'studio';
export type BillingCycle = 'monthly' | 'yearly';
export type FeatureKey =
  | 'flash' | 'watermark' | 'publicGallery' | 'allImage' | 'noWatermark' | 'pulseLite' | 'parallel'
  | 'pulseMotion' | 'commercial' | 'priority' | 'allPro' | 'seats' | 'api';

export interface PlanFeature { key: FeatureKey; vars?: Record<string, number> }

/** Prices in major units for readability; converted to minor units by the helpers below. */
interface PlanPrice { list: number; monthly: number; yearlyPerMonth: number }

export interface Plan {
  id: PlanId;
  name: string;
  creditsPerMonth: number;
  features: PlanFeature[];
  highlight?: boolean;
  prices: Record<Currency, PlanPrice>;
}

export interface CreditPack { id: string; credits: number; bonus?: number; prices: Record<Currency, { list: number; price: number }> }

const FREE: PlanPrice = { list: 0, monthly: 0, yearlyPerMonth: 0 };

/**
 * PRICE BOOK — the owner edits this table.
 * Non-USD prices are hand-rounded local price points, not live FX conversions.
 * Review AZN/TRY/EUR/GBP before launch (TRY especially, because of inflation).
 */
export const PLANS: Plan[] = [
  {
    id: 'free', name: 'Free', creditsPerMonth: 30,
    features: [{ key: 'flash' }, { key: 'watermark' }, { key: 'publicGallery' }],
    prices: { USD: FREE, EUR: FREE, AZN: FREE, TRY: FREE, GBP: FREE },
  },
  {
    id: 'starter', name: 'Starter', creditsPerMonth: 400,
    features: [{ key: 'allImage' }, { key: 'noWatermark' }, { key: 'pulseLite' }, { key: 'parallel', vars: { n: 2 } }],
    prices: {
      USD: { list: 12, monthly: 7, yearlyPerMonth: 5 },
      EUR: { list: 11.9, monthly: 6.9, yearlyPerMonth: 4.9 },
      AZN: { list: 19.9, monthly: 11.9, yearlyPerMonth: 8.9 },
      TRY: { list: 449, monthly: 249, yearlyPerMonth: 179 },
      GBP: { list: 9.9, monthly: 5.9, yearlyPerMonth: 4.2 },
    },
  },
  {
    id: 'creator', name: 'Creator', creditsPerMonth: 1500, highlight: true,
    features: [{ key: 'pulseMotion' }, { key: 'commercial' }, { key: 'parallel', vars: { n: 4 } }, { key: 'priority' }],
    prices: {
      USD: { list: 36, monthly: 19, yearlyPerMonth: 14 },
      EUR: { list: 33.9, monthly: 17.9, yearlyPerMonth: 12.9 },
      AZN: { list: 59.9, monthly: 31.9, yearlyPerMonth: 23.9 },
      TRY: { list: 1299, monthly: 699, yearlyPerMonth: 499 },
      GBP: { list: 28.9, monthly: 15.9, yearlyPerMonth: 11.9 },
    },
  },
  {
    id: 'studio', name: 'Studio', creditsPerMonth: 5000,
    features: [{ key: 'allPro' }, { key: 'parallel', vars: { n: 8 } }, { key: 'seats', vars: { n: 3 } }, { key: 'api' }],
    prices: {
      USD: { list: 89, monthly: 49, yearlyPerMonth: 37 },
      EUR: { list: 82.9, monthly: 45.9, yearlyPerMonth: 34.9 },
      AZN: { list: 149.9, monthly: 82.9, yearlyPerMonth: 62.9 },
      TRY: { list: 3299, monthly: 1799, yearlyPerMonth: 1299 },
      GBP: { list: 71.9, monthly: 38.9, yearlyPerMonth: 29.9 },
    },
  },
];

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: 'pack_200', credits: 200,
    prices: { USD: { list: 6, price: 4 }, EUR: { list: 5.9, price: 3.9 }, AZN: { list: 9.9, price: 6.9 }, TRY: { list: 249, price: 149 }, GBP: { list: 4.9, price: 3.4 } },
  },
  {
    id: 'pack_600', credits: 600, bonus: 50,
    prices: { USD: { list: 18, price: 10 }, EUR: { list: 16.9, price: 9.4 }, AZN: { list: 29.9, price: 16.9 }, TRY: { list: 699, price: 399 }, GBP: { list: 14.4, price: 7.9 } },
  },
  {
    id: 'pack_1500', credits: 1500, bonus: 200,
    prices: { USD: { list: 45, price: 22 }, EUR: { list: 41.9, price: 20.9 }, AZN: { list: 76.9, price: 37.9 }, TRY: { list: 1799, price: 899 }, GBP: { list: 35.9, price: 17.9 } },
  },
];

export const FREE_PLAN_CREDITS = PLANS[0].creditsPerMonth;

export const findPlan = (id: string) => PLANS.find((p) => p.id === id);
export const findPack = (id: string) => CREDIT_PACKS.find((p) => p.id === id);
export const getPlan = (id: PlanId) => findPlan(id)!;

export type CheckoutItem =
  | { type: 'plan'; planId: Exclude<PlanId, 'free'>; cycle: BillingCycle }
  | { type: 'pack'; packId: string };

export interface Quote { currency: Currency; amountMinor: number; listMinor: number; credits: number }

/** Server-authoritative price for an item. Returns null for unknown/free items. */
export function quote(item: CheckoutItem, currency: Currency): Quote | null {
  if (item.type === 'plan') {
    const plan = findPlan(item.planId);
    if (!plan || plan.id === 'free') return null;
    const p = plan.prices[currency];
    const yearly = item.cycle === 'yearly';
    return {
      currency,
      amountMinor: yearly ? toMinor(p.yearlyPerMonth) * 12 : toMinor(p.monthly),
      listMinor: yearly ? toMinor(p.list) * 12 : toMinor(p.list),
      credits: plan.creditsPerMonth,
    };
  }
  const pack = findPack(item.packId);
  if (!pack) return null;
  const p = pack.prices[currency];
  return { currency, amountMinor: toMinor(p.price), listMinor: toMinor(p.list), credits: pack.credits + (pack.bonus ?? 0) };
}

export const percentOff = (list: number, price: number) => (list > 0 ? Math.round((1 - price / list) * 100) : 0);

/** Narrowing helper for untrusted checkout input. */
export function parseCheckoutItem(v: unknown): CheckoutItem | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.type === 'plan' && (o.cycle === 'monthly' || o.cycle === 'yearly') && typeof o.planId === 'string') {
    const plan = findPlan(o.planId);
    if (!plan || plan.id === 'free') return null;
    return { type: 'plan', planId: plan.id as Exclude<PlanId, 'free'>, cycle: o.cycle };
  }
  if (o.type === 'pack' && typeof o.packId === 'string' && findPack(o.packId)) return { type: 'pack', packId: o.packId };
  return null;
}

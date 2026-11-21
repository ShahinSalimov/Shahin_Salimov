import type { CreditPack, Plan } from '@/types';

/**
 * PRICING CONFIG — single source of truth.
 *
 * `listMonthly` = Vexora's regular price; `monthly` / `yearlyPerMonth` = discounted price shown to users.
 *
 * REFERENCE_PRICES must be filled in with the competitor's *verified* current prices
 * (they could not be fetched automatically). `assertCheaperThanReference` in dev
 * warns if any of our discounted prices is not strictly lower.
 */
export const REFERENCE_PRICES: Partial<Record<Plan['id'], { monthly: number; yearlyPerMonth: number }>> = {
  // starter: { monthly: 0, yearlyPerMonth: 0 },   // TODO: fill with verified numbers
  // creator: { monthly: 0, yearlyPerMonth: 0 },
  // studio:  { monthly: 0, yearlyPerMonth: 0 },
};

export const PLANS: Plan[] = [
  {
    id: 'free', name: 'Free',
    listMonthly: 0, monthly: 0, yearlyPerMonth: 0, creditsPerMonth: 30,
    features: [{ key: 'flash' }, { key: 'watermark' }, { key: 'publicGallery' }],
  },
  {
    id: 'starter', name: 'Starter',
    listMonthly: 12, monthly: 7, yearlyPerMonth: 5, creditsPerMonth: 400,
    features: [{ key: 'allImage' }, { key: 'noWatermark' }, { key: 'pulseLite' }, { key: 'parallel', vars: { n: 2 } }],
  },
  {
    id: 'creator', name: 'Creator', highlight: true,
    listMonthly: 36, monthly: 19, yearlyPerMonth: 14, creditsPerMonth: 1500,
    features: [{ key: 'pulseMotion' }, { key: 'commercial' }, { key: 'parallel', vars: { n: 4 } }, { key: 'priority' }],
  },
  {
    id: 'studio', name: 'Studio',
    listMonthly: 89, monthly: 49, yearlyPerMonth: 37, creditsPerMonth: 5000,
    features: [{ key: 'allPro' }, { key: 'parallel', vars: { n: 8 } }, { key: 'seats', vars: { n: 3 } }, { key: 'api' }],
  },
];

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'pack_200', credits: 200, listPrice: 6, price: 4 },
  { id: 'pack_600', credits: 600, listPrice: 18, price: 10, bonus: 50 },
  { id: 'pack_1500', credits: 1500, listPrice: 45, price: 22, bonus: 200 },
];

export const getPlan = (id: Plan['id']) => PLANS.find((p) => p.id === id)!;
export const getPack = (id: string) => CREDIT_PACKS.find((p) => p.id === id);

export function assertCheaperThanReference() {
  for (const plan of PLANS) {
    const ref = REFERENCE_PRICES[plan.id];
    if (!ref) continue;
    if (plan.monthly >= ref.monthly || plan.yearlyPerMonth >= ref.yearlyPerMonth) {
      console.warn(`[pricing] ${plan.name} is not cheaper than the reference price`, { plan, ref });
    }
  }
}

import { PLANS } from '@workspace/vexora-core';
import type { Plan } from '@/types';

export { CREDIT_PACKS, PLANS, findPack, getPlan, percentOff, quote } from '@workspace/vexora-core';

/**
 * Competitor reference prices (USD/month) for the dev-time "are we cheaper?" check.
 * Fill in with verified numbers — they could not be fetched automatically.
 */
export const REFERENCE_PRICES: Partial<Record<Plan['id'], { monthly: number; yearlyPerMonth: number }>> = {
  // starter: { monthly: 0, yearlyPerMonth: 0 },
};

export function assertCheaperThanReference() {
  for (const plan of PLANS) {
    const ref = REFERENCE_PRICES[plan.id];
    const usd = plan.prices.USD;
    if (ref && (usd.monthly >= ref.monthly || usd.yearlyPerMonth >= ref.yearlyPerMonth)) {
      console.warn(`[pricing] ${plan.name} is not cheaper than the reference price`, { usd, ref });
    }
  }
}

import type { CheckoutItem } from '@/types';
import { getPack, getPlan } from '@/data/pricing';

/** Amount actually charged now for a checkout item (labels are built in the UI via i18n). */
export function priceFor(item: CheckoutItem): { amount: number; listAmount: number; credits: number } {
  if (item.type === 'plan') {
    const p = getPlan(item.planId);
    const yearly = item.cycle === 'yearly';
    return {
      amount: yearly ? p.yearlyPerMonth * 12 : p.monthly,
      listAmount: yearly ? p.listMonthly * 12 : p.listMonthly,
      credits: p.creditsPerMonth,
    };
  }
  const pack = getPack(item.packId)!;
  return { amount: pack.price, listAmount: pack.listPrice, credits: pack.credits + (pack.bonus ?? 0) };
}

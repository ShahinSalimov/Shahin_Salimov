import type { Settings } from "./settings.ts";

export type PriceInput = { cost: number; shippingCost: number };
export type PriceResult = { price: number; profit: number; marginPercent: number };

type PricingSettings = Pick<
  Settings,
  "marginPercent" | "minProfit" | "ebayFeePercent" | "ebayFixedFee" | "adRatePercent"
>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Round up to the next "x.99" price point. */
export function charmPrice(p: number): number {
  const up = Math.ceil(p + 0.01) - 0.01;
  return round2(up);
}

export function profitAt(price: number, input: PriceInput, s: PricingSettings): number {
  const variableFees = price * ((s.ebayFeePercent + s.adRatePercent) / 100);
  return round2(price - variableFees - s.ebayFixedFee - input.cost - input.shippingCost);
}

/**
 * Sale price (free shipping to buyer) that hits the target margin and never
 * falls under the minimum absolute profit.
 */
export function computePrice(input: PriceInput, s: PricingSettings): PriceResult {
  const feeRate = (s.ebayFeePercent + s.adRatePercent) / 100;
  const base = input.cost + input.shippingCost + s.ebayFixedFee;
  const denomMargin = 1 - feeRate - s.marginPercent / 100;
  if (denomMargin <= 0) throw new Error("Fees + margin must be below 100%");
  const byMargin = base / denomMargin;
  const byMinProfit = (base + s.minProfit) / (1 - feeRate);
  const price = charmPrice(Math.max(byMargin, byMinProfit));
  const profit = profitAt(price, input, s);
  return { price, profit, marginPercent: round2((profit / price) * 100) };
}

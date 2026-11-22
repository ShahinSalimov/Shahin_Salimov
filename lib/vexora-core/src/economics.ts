import { findModel, type AIModel, type Resolution } from './models';
import { CREDIT_PACKS, PLANS } from './pricing';
import type { Currency } from './currency';

/**
 * UNIT ECONOMICS — makes "every sale earns more than it costs" a rule enforced in code.
 *
 *   net value of one paid credit  = cheapest price per credit we can actually charge (USD or AZN book)
 *                                   × (1 − gateway fee − tax)
 *   credits charged for an output ≥ vendor cost ÷ (net credit value × (1 − target margin))
 *
 * If a model's listed creditCost is lower than that, the higher number is charged.
 */
export const ECONOMICS = {
  /** share of revenue kept after the AI vendor is paid (0.5 = 50 % gross margin) */
  targetMargin: 0.5,
  /** payment gateway commission (local AZ gateways ~2.5–3.8 %; use your contract figure) */
  gatewayFee: 0.038,
  /** tax on revenue — ESTIMATE for a sole proprietor on the simplified regime; confirm with an accountant */
  taxRate: 0.02,
  /**
   * Currencies money is actually charged in, with USD value of 1 unit.
   * AZN is pegged at 1.70 per USD. Display-only currencies (EUR, TRY, GBP) never reach the gateway.
   */
  chargeFx: { USD: 1, AZN: 1 / 1.7 } as Partial<Record<Currency, number>>,
  /** estimated revenue of one completed rewarded-ad view, USD (web, regional traffic: conservative) */
  adRevenuePerViewUsd: 0.001,
};

/** Cheapest a customer can ever buy one credit for, in USD (best yearly plan or biggest pack). */
export function cheapestCreditUsd(): number {
  const perCredit: number[] = [];
  for (const [cur, usd] of Object.entries(ECONOMICS.chargeFx) as [Currency, number][]) {
    for (const p of PLANS) {
      const pr = p.prices[cur];
      if (!pr.list) continue;
      perCredit.push((pr.monthly / p.creditsPerMonth) * usd, (pr.yearlyPerMonth / p.creditsPerMonth) * usd);
    }
    for (const k of CREDIT_PACKS) perCredit.push((k.prices[cur].price / (k.credits + (k.bonus ?? 0))) * usd);
  }
  return Math.min(...perCredit);
}

/** Net USD we keep from one paid credit, after the gateway fee and tax. */
export const netCreditUsd = () => cheapestCreditUsd() * (1 - ECONOMICS.gatewayFee - ECONOMICS.taxRate);

/** USD value of an amount in minor units, for currencies we charge in (null if unknown). */
export const toUsd = (minor: number, currency: Currency): number | null => {
  const fx = ECONOMICS.chargeFx[currency];
  return fx === undefined ? null : (minor / 100) * fx;
};

export function vendorUnitCost(m: AIModel, resolution?: Resolution): number {
  if (typeof m.vendorCostUsd === 'number') return m.vendorCostUsd;
  const r = resolution ?? m.resolutions?.[m.resolutions.length - 1];
  return (r && m.vendorCostUsd[r]) || Math.max(...Object.values(m.vendorCostUsd).map(Number));
}

/** Minimum credits per unit (image or video second) that keeps the target margin. */
export function minCreditsPerUnit(m: AIModel, resolution?: Resolution): number {
  return Math.ceil(vendorUnitCost(m, resolution) / (netCreditUsd() * (1 - ECONOMICS.targetMargin)));
}

/** Credits actually charged per unit: the listed price, raised if it would lose money. */
export function unitCredits(m: AIModel, resolution?: Resolution): number {
  return Math.max(m.creditCost, minCreditsPerUnit(m, resolution));
}

export interface ModelEconomics {
  modelId: string;
  name: string;
  unit: 'image' | 'second';
  resolution?: Resolution;
  vendorCostUsd: number;
  credits: number;
  /** worst-case revenue (cheapest credit) */
  revenueUsd: number;
  margin: number;
  freeCredits: boolean;
}

/** One row per model (and per resolution for video) — shown in the Cashbox. */
export function economicsTable(models: AIModel[]): ModelEconomics[] {
  const net = netCreditUsd();
  return models.flatMap((m) => (m.resolutions ?? [undefined]).map((r) => {
    const credits = unitCredits(m, r);
    const cost = vendorUnitCost(m, r);
    const revenue = credits * net;
    return {
      modelId: m.id, name: m.name, unit: m.kind === 'image' ? 'image' as const : 'second' as const, resolution: r,
      vendorCostUsd: cost, credits, revenueUsd: revenue, margin: revenue > 0 ? 1 - cost / revenue : 0, freeCredits: m.freeCredits,
    };
  }));
}

/**
 * Rewarded ads → free credits. Free credits can only be spent on `freeCredits` models, so the
 * worst case is the most expensive of those per credit. Returns credits earned per completed view
 * (fractional — the server grants whole credits as views accumulate).
 */
export function adCreditsPerView(models: AIModel[]): number {
  const worstCostPerCredit = Math.max(...models.filter((m) => m.freeCredits).map((m) => vendorUnitCost(m) / unitCredits(m)));
  return (ECONOMICS.adRevenuePerViewUsd * (1 - ECONOMICS.targetMargin)) / worstCostPerCredit;
}

export const isFreeCreditModel = (modelId: string) => !!findModel(modelId)?.freeCredits;

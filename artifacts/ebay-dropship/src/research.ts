import type { Settings } from "./settings.ts";

export type MarketSnapshot = {
  /** Total active fixed-price listings eBay reports for the query. */
  total: number;
  /** Delivered prices (item + shipping) of the sampled competitors. */
  prices: number[];
};

export type ScoreInput = {
  price: number;
  profit: number;
  stock: number;
  shippingDays: number | null;
  market: MarketSnapshot | null;
};

export type ScoreResult = {
  score: number;
  competitorMedian: number | null;
  notes: string[];
  reject: string | null;
};

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

/**
 * Scores a candidate 0-100. Heuristic, based on what the public eBay Browse
 * API exposes (active listings, not sold history).
 *  - profit       35 pts: absolute profit, saturates at $15
 *  - price edge   25 pts: how far below the competitor median we are
 *  - demand       15 pts: some competition proves demand; too much is a red flag
 *  - shipping     15 pts: faster is better (seller performance)
 *  - stock        10 pts
 */
export function scoreCandidate(input: ScoreInput, s: Settings): ScoreResult {
  const notes: string[] = [];
  if (input.price > s.maxPrice) return { score: 0, competitorMedian: null, notes, reject: `price ${input.price} > max ${s.maxPrice}` };
  if (input.price < s.minPrice) return { score: 0, competitorMedian: null, notes, reject: `price ${input.price} < min ${s.minPrice}` };
  if (input.stock < s.minStock) return { score: 0, competitorMedian: null, notes, reject: `stock ${input.stock} < ${s.minStock}` };
  if (input.shippingDays !== null && input.shippingDays > s.maxShippingDays) {
    return { score: 0, competitorMedian: null, notes, reject: `shipping ${input.shippingDays}d > ${s.maxShippingDays}d` };
  }

  const med = input.market ? median(input.market.prices) : null;
  if (med !== null && input.price > med * s.maxCompetitorPriceRatio) {
    return { score: 0, competitorMedian: med, notes, reject: `price ${input.price} above market median ${med.toFixed(2)}` };
  }

  let score = 35 * clamp(input.profit / 15);
  notes.push(`profit $${input.profit.toFixed(2)}`);

  if (med !== null) {
    const edge = (med - input.price) / med; // 0.3 = 30% cheaper than median
    score += 25 * clamp(0.4 + edge * 2);
    notes.push(`median $${med.toFixed(2)}`);
  } else {
    score += 10;
    notes.push("no market data");
  }

  if (input.market) {
    const t = input.market.total;
    const demand = t < 5 ? 0.3 : t <= 2000 ? 1 : t <= 20000 ? 0.6 : 0.3;
    score += 15 * demand;
    notes.push(`${t} active listings`);
  } else {
    score += 7;
  }

  const days = input.shippingDays ?? s.maxShippingDays;
  score += 15 * clamp(1 - (days - 3) / Math.max(1, s.maxShippingDays - 3));
  notes.push(`${days}d shipping`);

  score += 10 * clamp(input.stock / 200);

  return { score: Math.round(score), competitorMedian: med, notes, reject: null };
}

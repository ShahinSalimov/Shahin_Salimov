import type { DB } from "./db.ts";

// Business settings, editable from the dashboard. Defaults are tuned for
// "full auto" mode; DRY_RUN in .env still blocks all real writes until you
// turn it off.
export const DEFAULT_SETTINGS = {
  // Pricing
  marginPercent: 20, // target net profit as % of sale price
  minProfit: 4, // never list below this net profit (USD)
  ebayFeePercent: 14.2, // 13.25% FVF is also charged on sales tax, so ~14.2% effective; check your category
  ebayFixedFee: 0.4, // per-order fixed fee
  adRatePercent: 0, // promoted listings ad rate, 0 if not used
  maxPrice: 80, // skip products that would sell above this
  minPrice: 9, // skip products that would sell below this
  // Research
  keywords: "phone holder car, led strip lights, pet hair remover, kitchen gadget",
  productsPerKeyword: 20,
  maxCompetitorPriceRatio: 1.05, // our price must be <= median competitor * ratio
  maxShippingDays: 12, // skip slower shipping (eBay handling + delivery risk)
  shipFromCountries: "US,CN", // CJ warehouses to accept, in preference order
  minStock: 20,
  // Automation
  automationEnabled: true, // master switch for scheduled jobs
  autoApproveMinScore: 70, // candidates scoring >= this get listed automatically (0 = off)
  maxActiveListings: 100, // respect your eBay selling limits
  dailyListingLimit: 15,
  autoFulfill: true, // place supplier order when an eBay order arrives
  autoPaySupplier: true, // pay CJ order from CJ wallet balance
  listingQuantity: 5, // quantity shown on eBay (real stock is checked on sync)
  handlingDays: 3,
  autoApproveCancellations: true, // approve buyer cancel requests if nothing shipped yet
  autoProvideTracking: true, // answer "item not received" cases with the tracking number
  autoDraftReplies: true, // AI prepares a reply for every new buyer message
  autoSendReplies: false, // send AI replies without your review
  lowBalanceAlert: 50, // Telegram alert when CJ wallet is below this (USD)
  // Schedules (minutes)
  researchEveryMin: 720,
  syncEveryMin: 180,
  ordersEveryMin: 15,
  trackingEveryMin: 60,
  messagesEveryMin: 15,
  casesEveryMin: 30,
  financeEveryMin: 360,
  // eBay business policies and location (filled from dashboard "eBay setup")
  fulfillmentPolicyId: "",
  paymentPolicyId: "",
  returnPolicyId: "",
  merchantLocationKey: "",
};

export type Settings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof Settings;

export function getSettings(db: DB): Settings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (key in DEFAULT_SETTINGS) out[key] = JSON.parse(value);
  }
  return out as Settings;
}

export function saveSettings(db: DB, patch: Partial<Record<SettingKey, unknown>>): Settings {
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  for (const [key, raw] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    const def = DEFAULT_SETTINGS[key as SettingKey];
    let value: unknown = raw;
    if (typeof def === "number") {
      value = Number(raw);
      if (!Number.isFinite(value)) continue;
    } else if (typeof def === "boolean") {
      value = raw === true || raw === "true" || raw === "on" || raw === "1";
    } else {
      value = String(raw ?? "").trim();
    }
    stmt.run(key, JSON.stringify(value));
  }
  return getSettings(db);
}

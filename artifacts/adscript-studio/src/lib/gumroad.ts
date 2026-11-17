import type { CreditPack } from "./config";

const VERIFY_URL = "https://api.gumroad.com/v2/licenses/verify";

/** Result of asking Gumroad about one license key for one product. */
export type ProductLicenseStatus =
  | { status: "valid"; quantity: number; saleId: string | null }
  | { status: "revoked" } // refunded, charged back, or dispute lost
  | { status: "not_found" }
  | { status: "error"; reason: string };

export type LicenseCheck =
  | { ok: true; pack: CreditPack; credits: number; saleId: string | null; licenseKey: string }
  | { ok: false; reason: string };

type GumroadVerifyResponse = {
  success?: boolean;
  purchase?: {
    product_id?: string;
    sale_id?: string;
    quantity?: number;
    refunded?: boolean;
    chargebacked?: boolean;
    disputed?: boolean;
    dispute_won?: boolean;
  };
};

export function normalizeLicenseKey(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isWellFormedLicenseKey(key: string): boolean {
  return /^[A-Z0-9-]{8,64}$/.test(key);
}

/**
 * Ask Gumroad for the state of a license key on a specific product.
 * We never increment Gumroad's use counter: our `redemptions` table is the single source of truth.
 */
export async function checkLicenseForProduct(
  licenseKey: string,
  productId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProductLicenseStatus> {
  const body = new URLSearchParams({ product_id: productId, license_key: licenseKey, increment_uses_count: "false" });

  let res: Response;
  try {
    res = await fetchImpl(VERIFY_URL, { method: "POST", body });
  } catch {
    return { status: "error", reason: "Could not reach Gumroad. Please try again in a minute." };
  }
  if (res.status === 404) return { status: "not_found" };
  if (!res.ok) return { status: "error", reason: "Gumroad verification failed. Please try again later." };

  const data = (await res.json()) as GumroadVerifyResponse;
  const purchase = data.purchase;
  if (!data.success || !purchase) return { status: "not_found" };
  if (purchase.product_id && purchase.product_id !== productId) return { status: "not_found" };
  if (purchase.refunded || purchase.chargebacked || (purchase.disputed && !purchase.dispute_won)) {
    return { status: "revoked" };
  }
  const q = purchase.quantity;
  return { status: "valid", quantity: typeof q === "number" && Number.isInteger(q) && q > 0 ? q : 1, saleId: purchase.sale_id ?? null };
}

/**
 * Check a license key against every configured credit pack.
 * The buyer doesn't tell us which pack they bought, so we try each pack until one matches.
 */
export async function verifyLicense(rawKey: string, packs: CreditPack[], fetchImpl: typeof fetch = fetch): Promise<LicenseCheck> {
  const licenseKey = normalizeLicenseKey(rawKey);
  if (!isWellFormedLicenseKey(licenseKey)) return { ok: false, reason: "That doesn't look like a valid license key." };
  if (packs.length === 0) return { ok: false, reason: "Credit packs are not configured yet." };

  for (const pack of packs) {
    const r = await checkLicenseForProduct(licenseKey, pack.productId, fetchImpl);
    if (r.status === "not_found") continue;
    if (r.status === "error") return { ok: false, reason: r.reason };
    if (r.status === "revoked") return { ok: false, reason: "This purchase was refunded or disputed." };
    return { ok: true, pack, credits: pack.credits * r.quantity, saleId: r.saleId, licenseKey };
  }
  return { ok: false, reason: "License key not found. Check that you copied it exactly." };
}

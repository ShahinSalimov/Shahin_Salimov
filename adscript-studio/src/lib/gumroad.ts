import type { CreditPack } from "./config";

const VERIFY_URL = "https://api.gumroad.com/v2/licenses/verify";

export type LicenseCheck =
  | { ok: true; pack: CreditPack; credits: number; saleId: string | null; licenseKey: string }
  | { ok: false; reason: string };

type GumroadVerifyResponse = {
  success?: boolean;
  message?: string;
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

/**
 * Check a license key against every configured credit pack.
 * Gumroad requires the product_id, and the buyer doesn't tell us which pack they bought,
 * so we try each pack until one matches.
 * We do NOT increment Gumroad's use counter: our `redemptions` table is the single source of truth.
 */
export async function verifyLicense(
  rawKey: string,
  packs: CreditPack[],
  fetchImpl: typeof fetch = fetch,
): Promise<LicenseCheck> {
  const licenseKey = normalizeLicenseKey(rawKey);
  if (!/^[A-Z0-9-]{8,64}$/.test(licenseKey)) {
    return { ok: false, reason: "That doesn't look like a valid license key." };
  }
  if (packs.length === 0) {
    return { ok: false, reason: "Credit packs are not configured yet." };
  }

  for (const pack of packs) {
    const body = new URLSearchParams({
      product_id: pack.productId,
      license_key: licenseKey,
      increment_uses_count: "false",
    });

    let res: Response;
    try {
      res = await fetchImpl(VERIFY_URL, { method: "POST", body });
    } catch {
      return { ok: false, reason: "Could not reach Gumroad. Please try again in a minute." };
    }

    // 404 = key does not belong to this product -> try the next pack.
    if (res.status === 404) continue;
    if (!res.ok) {
      return { ok: false, reason: "Gumroad verification failed. Please try again later." };
    }

    const data = (await res.json()) as GumroadVerifyResponse;
    const purchase = data.purchase;
    if (!data.success || !purchase) continue;
    if (purchase.product_id && purchase.product_id !== pack.productId) continue;

    if (purchase.refunded || purchase.chargebacked || (purchase.disputed && !purchase.dispute_won)) {
      return { ok: false, reason: "This purchase was refunded or disputed." };
    }

    const quantity = Number.isInteger(purchase.quantity) && purchase.quantity! > 0 ? purchase.quantity! : 1;
    return {
      ok: true,
      pack,
      credits: pack.credits * quantity,
      saleId: purchase.sale_id ?? null,
      licenseKey,
    };
  }

  return { ok: false, reason: "License key not found. Check that you copied it exactly." };
}

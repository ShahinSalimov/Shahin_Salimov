import { timingSafeEqual } from "node:crypto";
import { checkLicenseForProduct, normalizeLicenseKey } from "./gumroad";

export type Redemption = { license_key: string; product_id: string };

export type RefundDeps = {
  findRedemption: (by: { licenseKey?: string; saleId?: string }) => Promise<Redemption | null>;
  revoke: (licenseKey: string) => Promise<number | null>;
  fetchImpl?: typeof fetch;
};

export type RefundOutcome =
  | { result: "ignored"; reason: string }
  | { result: "still_valid" }
  | { result: "revoked"; newBalance: number | null }
  | { result: "retry"; reason: string };

/** Constant-time comparison of the webhook token from the URL. */
export function isValidWebhookToken(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Handle a Gumroad refund/dispute notification.
 * The payload is not signed, so we never trust it: we only use it to find our redemption,
 * then ask Gumroad's API directly whether that purchase is really refunded.
 */
export async function handleRefundNotification(payload: URLSearchParams, deps: RefundDeps): Promise<RefundOutcome> {
  const rawKey = payload.get("license_key");
  const saleId = payload.get("sale_id") ?? undefined;
  if (!rawKey && !saleId) return { result: "ignored", reason: "no license_key or sale_id" };

  const redemption = await deps.findRedemption({ licenseKey: rawKey ? normalizeLicenseKey(rawKey) : undefined, saleId });
  if (!redemption) return { result: "ignored", reason: "key was never redeemed" };

  const status = await checkLicenseForProduct(redemption.license_key, redemption.product_id, deps.fetchImpl);
  if (status.status === "error") return { result: "retry", reason: status.reason };
  if (status.status === "valid") return { result: "still_valid" };

  // "revoked", or "not_found" (Gumroad no longer recognises the purchase) -> take credits back.
  return { result: "revoked", newBalance: await deps.revoke(redemption.license_key) };
}

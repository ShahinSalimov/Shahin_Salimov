import { describe, expect, it, vi } from "vitest";
import { handleRefundNotification, isValidWebhookToken } from "./refunds";

const KEY = "ABCD1234-EF567890-12345678-ABCDEF12";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function deps(gumroad: Response, found = true) {
  return {
    findRedemption: vi.fn().mockResolvedValue(found ? { license_key: KEY, product_id: "prod_1" } : null),
    revoke: vi.fn().mockResolvedValue(5),
    fetchImpl: vi.fn().mockResolvedValue(gumroad),
  };
}

describe("handleRefundNotification", () => {
  it("revokes credits when Gumroad confirms the refund", async () => {
    const d = deps(json(200, { success: true, purchase: { product_id: "prod_1", refunded: true } }));
    const r = await handleRefundNotification(new URLSearchParams({ license_key: KEY.toLowerCase() }), d);
    expect(r).toEqual({ result: "revoked", newBalance: 5 });
    expect(d.findRedemption).toHaveBeenCalledWith({ licenseKey: KEY, saleId: undefined });
    expect(d.revoke).toHaveBeenCalledWith(KEY);
  });

  it("does not trust the payload: keeps credits if Gumroad says the purchase is fine", async () => {
    const d = deps(json(200, { success: true, purchase: { product_id: "prod_1", refunded: false } }));
    const r = await handleRefundNotification(new URLSearchParams({ license_key: KEY, refunded: "true" }), d);
    expect(r).toEqual({ result: "still_valid" });
    expect(d.revoke).not.toHaveBeenCalled();
  });

  it("finds the redemption by sale_id when no key is sent", async () => {
    const d = deps(json(200, { success: true, purchase: { product_id: "prod_1", chargebacked: true } }));
    await handleRefundNotification(new URLSearchParams({ sale_id: "s1" }), d);
    expect(d.findRedemption).toHaveBeenCalledWith({ licenseKey: undefined, saleId: "s1" });
    expect(d.revoke).toHaveBeenCalled();
  });

  it("ignores purchases that were never redeemed", async () => {
    const d = deps(json(200, {}), false);
    expect((await handleRefundNotification(new URLSearchParams({ sale_id: "s1" }), d)).result).toBe("ignored");
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("asks for a retry when Gumroad is unreachable", async () => {
    const d = deps(json(500, {}));
    expect((await handleRefundNotification(new URLSearchParams({ license_key: KEY }), d)).result).toBe("retry");
    expect(d.revoke).not.toHaveBeenCalled();
  });
});

describe("isValidWebhookToken", () => {
  it("accepts only the exact token", () => {
    expect(isValidWebhookToken("secret-123", "secret-123")).toBe(true);
    expect(isValidWebhookToken("secret-124", "secret-123")).toBe(false);
    expect(isValidWebhookToken("short", "secret-123")).toBe(false);
    expect(isValidWebhookToken(null, "secret-123")).toBe(false);
    expect(isValidWebhookToken("x", undefined)).toBe(false);
  });
});

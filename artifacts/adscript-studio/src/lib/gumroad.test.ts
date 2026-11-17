import { describe, expect, it, vi } from "vitest";
import type { CreditPack } from "./config";
import { normalizeLicenseKey, verifyLicense } from "./gumroad";

const packs: CreditPack[] = [
  { productId: "prod_small", name: "Starter", credits: 20, price: "$5", url: "https://x.gumroad.com/l/a" },
  { productId: "prod_big", name: "Creator", credits: 60, price: "$12", url: "https://x.gumroad.com/l/b" },
];
const KEY = "ABCD1234-EF567890-12345678-ABCDEF12";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("verifyLicense", () => {
  it("matches the second pack after a 404 on the first and multiplies by quantity", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(404, { success: false }))
      .mockResolvedValueOnce(json(200, { success: true, purchase: { product_id: "prod_big", sale_id: "s1", quantity: 2, refunded: false, chargebacked: false } }));
    const r = await verifyLicense(KEY.toLowerCase(), packs, fetchMock);
    expect(r).toEqual({ ok: true, pack: packs[1], credits: 120, saleId: "s1", licenseKey: KEY });

    const body = fetchMock.mock.calls[1][1].body as URLSearchParams;
    expect(body.get("product_id")).toBe("prod_big");
    expect(body.get("increment_uses_count")).toBe("false");
  });

  it("rejects refunded purchases", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { success: true, purchase: { product_id: "prod_small", refunded: true } }));
    const r = await verifyLicense(KEY, packs, fetchMock);
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("refunded") });
  });

  it("rejects disputed purchases unless the dispute was won", async () => {
    const lost = vi.fn().mockResolvedValue(json(200, { success: true, purchase: { product_id: "prod_small", disputed: true, dispute_won: false } }));
    expect((await verifyLicense(KEY, packs, lost)).ok).toBe(false);
    const won = vi.fn().mockResolvedValue(json(200, { success: true, purchase: { product_id: "prod_small", disputed: true, dispute_won: true } }));
    expect((await verifyLicense(KEY, packs, won)).ok).toBe(true);
  });

  it("returns not found when no pack matches", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(404, { success: false }));
    const r = await verifyLicense(KEY, packs, fetchMock);
    expect(r.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed keys without calling Gumroad", async () => {
    const fetchMock = vi.fn();
    expect((await verifyLicense("bad key!", packs, fetchMock)).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a network failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const r = await verifyLicense(KEY, packs, fetchMock);
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("Gumroad") });
  });

  it("normalizes keys", () => {
    expect(normalizeLicenseKey("  abc-def \n")).toBe("ABC-DEF");
  });
});

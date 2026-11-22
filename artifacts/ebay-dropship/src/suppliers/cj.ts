// CJdropshipping API v2 client.
// Docs: https://developers.cjdropshipping.com/en/api/api2/
// All endpoint paths and field names are kept in this one file. If CJ changes
// a field, this is the only place to fix.

import type { DB } from "../db.ts";
import { requestJson, type FetchLike } from "../http.ts";
import type {
  ShippingQuote,
  Supplier,
  SupplierOrderInput,
  SupplierOrderStatus,
  SupplierProduct,
} from "./types.ts";

type CjEnvelope<T> = { code: number; result: boolean; message: string; data: T };

/** "12.5" -> 12.5, "3.20 -- 5.10" -> 3.2 (lowest), number -> number */
export function parseCjPrice(v: unknown): number {
  if (typeof v === "number") return v;
  const m = String(v ?? "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

/** "7-12" -> 12, "15" -> 15 */
export function parseAging(v: unknown): number | null {
  const nums = String(v ?? "").match(/\d+/g);
  return nums ? Math.max(...nums.map(Number)) : null;
}

function parseImages(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try {
      return (JSON.parse(v) as unknown[]).map(String);
    } catch {
      return [];
    }
  }
  return typeof v === "string" && v ? v.split(",").map((s) => s.trim()) : [];
}

export class CjSupplier implements Supplier {
  readonly name = "cj";
  private db: DB;
  private apiKey: string;
  private baseUrl: string;
  private fetchImpl: FetchLike;

  constructor(opts: { db: DB; apiKey: string; baseUrl: string; fetchImpl?: FetchLike }) {
    this.db = opts.db;
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async token(): Promise<string> {
    const row = this.db.prepare("SELECT value, expires_at FROM tokens WHERE name = 'cj_access'").get() as
      | { value: string; expires_at: number }
      | undefined;
    if (row && row.expires_at > Date.now() + 60_000) return row.value;

    if (!this.apiKey) throw new Error("CJ_API_KEY is not set");
    const res = await requestJson<CjEnvelope<{ accessToken: string; accessTokenExpiryDate?: string }>>(
      this.fetchImpl,
      `${this.baseUrl}/authentication/getAccessToken`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: this.apiKey }) },
    );
    if (!res.result || !res.data?.accessToken) throw new Error(`CJ auth failed: ${res.message}`);
    const exp = res.data.accessTokenExpiryDate ? Date.parse(res.data.accessTokenExpiryDate) : NaN;
    const expiresAt = Number.isFinite(exp) ? exp : Date.now() + 14 * 24 * 3600_000;
    this.db
      .prepare(
        "INSERT INTO tokens (name, value, expires_at) VALUES ('cj_access', ?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at",
      )
      .run(res.data.accessToken, expiresAt);
    return res.data.accessToken;
  }

  private async call<T>(method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, unknown>): Promise<T> {
    const token = await this.token();
    let url = `${this.baseUrl}${path}`;
    const init: RequestInit = { method, headers: { "CJ-Access-Token": token, "Content-Type": "application/json" } };
    if ((method === "GET" || method === "DELETE") && params) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
      url += `?${qs}`;
    } else if (params) {
      init.body = JSON.stringify(params);
    }
    const res = await requestJson<CjEnvelope<T>>(this.fetchImpl, url, init);
    if (!res.result || (res.code !== 200 && res.code !== 0)) {
      throw new Error(`CJ ${path} failed: ${res.code} ${res.message}`);
    }
    return res.data;
  }

  async search(keyword: string, limit: number) {
    const data = await this.call<{ list?: Record<string, unknown>[] }>("GET", "/product/list", {
      productNameEn: keyword,
      pageNum: 1,
      pageSize: Math.min(limit, 200),
    });
    return (data.list ?? []).map((p) => ({
      productId: String(p.pid),
      title: String(p.productNameEn ?? ""),
      price: parseCjPrice(p.sellPrice),
    }));
  }

  async getProduct(productId: string): Promise<SupplierProduct> {
    const p = await this.call<Record<string, unknown>>("GET", "/product/query", { pid: productId });
    const variants = ((p.variants as Record<string, unknown>[]) ?? []).map((v) => ({
      variantId: String(v.vid),
      sku: String(v.variantSku ?? v.vid),
      name: String(v.variantNameEn ?? v.variantKey ?? ""),
      price: parseCjPrice(v.variantSellPrice),
      image: v.variantImage ? String(v.variantImage) : undefined,
      weightGrams: v.variantWeight ? Number(v.variantWeight) : undefined,
    }));
    return {
      productId: String(p.pid ?? productId),
      title: String(p.productNameEn ?? ""),
      description: String(p.description ?? ""),
      images: parseImages(p.productImageSet ?? p.productImage),
      price: parseCjPrice(p.sellPrice),
      variants,
    };
  }

  async getStock(variantId: string, countries: string[]) {
    const rows = await this.call<Record<string, unknown>[]>("GET", "/product/stock/queryByVid", { vid: variantId });
    const byCountry: Record<string, number> = {};
    for (const r of rows ?? []) {
      const cc = String(r.countryCode ?? "").toUpperCase();
      const n = Number(r.storageNum ?? r.totalInventoryNum ?? 0) || 0;
      byCountry[cc] = (byCountry[cc] ?? 0) + n;
    }
    const total = countries.reduce((sum, c) => sum + (byCountry[c] ?? 0), 0);
    return { total, byCountry };
  }

  async quoteShipping(variantId: string, fromCountry: string, toCountry: string): Promise<ShippingQuote | null> {
    const rows = await this.call<Record<string, unknown>[]>("POST", "/logistic/freightCalculate", {
      startCountryCode: fromCountry,
      endCountryCode: toCountry,
      products: [{ quantity: 1, vid: variantId }],
    });
    const quotes = (rows ?? [])
      .map((r) => ({
        logisticName: String(r.logisticName),
        price: parseCjPrice(r.logisticPrice),
        days: parseAging(r.logisticAging),
        fromCountry,
      }))
      .filter((q) => q.price > 0 || q.logisticName);
    if (!quotes.length) return null;
    // cheapest among the options that are not dramatically slower than the fastest
    const fastest = Math.min(...quotes.map((q) => q.days ?? 99));
    const ok = quotes.filter((q) => (q.days ?? 99) <= fastest + 5);
    return ok.sort((a, b) => a.price - b.price)[0] ?? null;
  }

  async createOrder(input: SupplierOrderInput) {
    const t = input.shipTo;
    const data = await this.call<Record<string, unknown>>("POST", "/shopping/order/createOrderV2", {
      orderNumber: input.reference,
      shippingCountryCode: t.countryCode,
      shippingCountry: t.countryCode,
      shippingProvince: t.state,
      shippingCity: t.city,
      shippingAddress: t.address1,
      shippingAddress2: t.address2,
      shippingZip: t.zip,
      shippingCustomerName: t.name,
      shippingPhone: t.phone,
      logisticName: input.logisticName,
      fromCountryCode: input.fromCountry,
      products: input.items.map((i) => ({ vid: i.variantId, quantity: i.quantity })),
    });
    const orderId = String(data.orderId ?? data.id ?? "");
    if (!orderId) throw new Error("CJ createOrder returned no orderId");
    const amount = parseCjPrice(data.orderAmount ?? data.totalAmount);
    return { orderId, cost: amount || null };
  }

  async payOrder(orderId: string) {
    await this.call("POST", "/shopping/pay/payBalance", { orderId });
  }

  async getBalance(): Promise<number | null> {
    const d = await this.call<Record<string, unknown>>("GET", "/shopping/pay/getBalance");
    const n = parseCjPrice(d?.amount ?? d?.balance);
    return Number.isFinite(n) ? n : null;
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.call("DELETE", "/shopping/order/deleteOrder", { orderId });
  }

  async getOrder(orderId: string): Promise<SupplierOrderStatus> {
    const d = await this.call<Record<string, unknown>>("GET", "/shopping/order/getOrderDetail", { orderId });
    const status = String(d.orderStatus ?? "");
    const tracking = d.trackNumber ? String(d.trackNumber) : null;
    return {
      status,
      trackingNumber: tracking,
      carrier: d.logisticName ? String(d.logisticName) : null,
      cancelled: /cancel/i.test(status),
    };
  }
}

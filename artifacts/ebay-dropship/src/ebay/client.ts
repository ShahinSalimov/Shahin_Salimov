// eBay REST APIs: OAuth, Sell Inventory, Sell Account, Sell Fulfillment,
// Buy Browse (market research) and Commerce Taxonomy.
// Docs: https://developer.ebay.com/develop/apis

import type { Config } from "../config.ts";
import type { DB } from "../db.ts";
import { log } from "../db.ts";
import { HttpError, requestJson, type FetchLike } from "../http.ts";
import type { MarketSnapshot } from "../research.ts";

export const USER_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
];
const APP_SCOPE = "https://api.ebay.com/oauth/api_scope";

export type InventoryItem = {
  sku: string;
  title: string;
  description: string;
  aspects: Record<string, string[]>;
  imageUrls: string[];
  quantity: number;
};

export type OfferInput = {
  sku: string;
  categoryId: string;
  price: number;
  quantity: number;
  description: string;
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
  merchantLocationKey: string;
};

export type EbayOrder = {
  orderId: string;
  buyer: string;
  total: number;
  currency: string;
  cancelled: boolean;
  paid: boolean;
  shipTo: {
    name: string;
    phone: string;
    address1: string;
    address2: string;
    city: string;
    state: string;
    zip: string;
    countryCode: string;
  };
  lineItems: { lineItemId: string; sku: string; title: string; quantity: number; price: number }[];
};

export type Policies = {
  fulfillment: { id: string; name: string }[];
  payment: { id: string; name: string }[];
  return: { id: string; name: string }[];
};

/** Guess eBay carrier code from supplier logistic name / tracking format. */
export function mapCarrier(logisticName: string | null, tracking: string): string {
  const n = (logisticName ?? "").toLowerCase();
  if (/^1Z[0-9A-Z]{16}$/i.test(tracking) || n.includes("ups")) return "UPS";
  if (n.includes("fedex")) return "FedEx";
  if (n.includes("dhl")) return "DHL";
  if (/^9[2-5]\d{18,24}$/.test(tracking) || n.includes("usps")) return "USPS";
  if (n.includes("yun")) return "YunExpress";
  if (n.includes("4px")) return "4PX";
  if (n.includes("yanwen")) return "Yanwen";
  if (n.includes("china post") || n.includes("epacket")) return "ChinaPost";
  return "Other";
}

export class EbayClient {
  private cfg: Config;
  private db: DB;
  private fetchImpl: FetchLike;

  constructor(opts: { cfg: Config; db: DB; fetchImpl?: FetchLike }) {
    this.cfg = opts.cfg;
    this.db = opts.db;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get dryRun(): boolean {
    return this.cfg.dryRun;
  }

  // ---------- OAuth ----------

  consentUrl(state: string): string {
    const e = this.cfg.ebay;
    const qs = new URLSearchParams({
      client_id: e.clientId,
      response_type: "code",
      redirect_uri: e.ruName,
      scope: USER_SCOPES.join(" "),
      state,
    });
    return `${e.authBase}/oauth2/authorize?${qs}`;
  }

  private basicAuth(): string {
    const { clientId, clientSecret } = this.cfg.ebay;
    return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  private async tokenRequest(form: Record<string, string>) {
    if (!this.cfg.ebay.clientId || !this.cfg.ebay.clientSecret) {
      throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are not set in .env");
    }
    return requestJson<{ access_token: string; expires_in: number; refresh_token?: string; refresh_token_expires_in?: number }>(
      this.fetchImpl,
      `${this.cfg.ebay.apiBase}/identity/v1/oauth2/token`,
      {
        method: "POST",
        headers: { Authorization: this.basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form).toString(),
      },
    );
  }

  private saveToken(name: string, value: string, expiresInSec: number) {
    this.db
      .prepare(
        "INSERT INTO tokens (name, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at",
      )
      .run(name, value, Date.now() + expiresInSec * 1000);
  }

  private readToken(name: string): { value: string; expires_at: number } | undefined {
    return this.db.prepare("SELECT value, expires_at FROM tokens WHERE name = ?").get(name) as
      | { value: string; expires_at: number }
      | undefined;
  }

  async exchangeCode(code: string): Promise<void> {
    const t = await this.tokenRequest({ grant_type: "authorization_code", code, redirect_uri: this.cfg.ebay.ruName });
    this.saveToken("ebay_user_access", t.access_token, t.expires_in);
    if (t.refresh_token) this.saveToken("ebay_refresh", t.refresh_token, t.refresh_token_expires_in ?? 47_304_000);
  }

  isConnected(): boolean {
    const r = this.readToken("ebay_refresh");
    return !!r && r.expires_at > Date.now();
  }

  private async userToken(): Promise<string> {
    const cur = this.readToken("ebay_user_access");
    if (cur && cur.expires_at > Date.now() + 120_000) return cur.value;
    const refresh = this.readToken("ebay_refresh");
    if (!refresh) throw new Error("eBay account is not connected. Open the dashboard and click 'Connect eBay'.");
    const t = await this.tokenRequest({ grant_type: "refresh_token", refresh_token: refresh.value, scope: USER_SCOPES.join(" ") });
    this.saveToken("ebay_user_access", t.access_token, t.expires_in);
    return t.access_token;
  }

  private async appToken(): Promise<string> {
    const cur = this.readToken("ebay_app_access");
    if (cur && cur.expires_at > Date.now() + 120_000) return cur.value;
    const t = await this.tokenRequest({ grant_type: "client_credentials", scope: APP_SCOPE });
    this.saveToken("ebay_app_access", t.access_token, t.expires_in);
    return t.access_token;
  }

  private async api<T>(
    method: string,
    path: string,
    opts: { body?: unknown; app?: boolean; query?: Record<string, string> } = {},
  ): Promise<T> {
    const token = opts.app ? await this.appToken() : await this.userToken();
    const qs = opts.query ? `?${new URLSearchParams(opts.query)}` : "";
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Language": "en-US",
      "Accept-Language": "en-US",
      "X-EBAY-C-MARKETPLACE-ID": this.cfg.ebay.marketplaceId,
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    return requestJson<T>(this.fetchImpl, `${this.cfg.ebay.apiBase}${path}${qs}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  }

  private dry(what: string): void {
    log(this.db, "info", "ebay", `[DRY_RUN] ${what}`);
  }

  // ---------- Research (Browse API, app token) ----------

  async marketSnapshot(query: string): Promise<MarketSnapshot> {
    const res = await this.api<{
      total?: number;
      itemSummaries?: { price?: { value: string }; shippingOptions?: { shippingCost?: { value: string } }[] }[];
    }>("GET", "/buy/browse/v1/item_summary/search", {
      app: true,
      query: {
        q: query,
        limit: "50",
        filter: "buyingOptions:{FIXED_PRICE},conditions:{NEW},deliveryCountry:US",
      },
    });
    const prices = (res.itemSummaries ?? [])
      .map((i) => Number(i.price?.value ?? 0) + Number(i.shippingOptions?.[0]?.shippingCost?.value ?? 0))
      .filter((p) => p > 0);
    return { total: res.total ?? prices.length, prices };
  }

  // ---------- Taxonomy (app token) ----------

  private async categoryTreeId(): Promise<string> {
    const cached = this.readToken("ebay_category_tree");
    if (cached && cached.expires_at > Date.now()) return cached.value;
    const r = await this.api<{ categoryTreeId: string }>("GET", "/commerce/taxonomy/v1/get_default_category_tree_id", {
      app: true,
      query: { marketplace_id: this.cfg.ebay.marketplaceId },
    });
    this.saveToken("ebay_category_tree", r.categoryTreeId, 7 * 24 * 3600);
    return r.categoryTreeId;
  }

  async suggestCategory(query: string): Promise<{ id: string; name: string } | null> {
    const tree = await this.categoryTreeId();
    const r = await this.api<{ categorySuggestions?: { category: { categoryId: string; categoryName: string } }[] }>(
      "GET",
      `/commerce/taxonomy/v1/category_tree/${tree}/get_category_suggestions`,
      { app: true, query: { q: query } },
    );
    const c = r.categorySuggestions?.[0]?.category;
    return c ? { id: c.categoryId, name: c.categoryName } : null;
  }

  async requiredAspects(categoryId: string): Promise<{ name: string; required: boolean; values: string[] }[]> {
    const tree = await this.categoryTreeId();
    const r = await this.api<{
      aspects?: {
        localizedAspectName: string;
        aspectConstraint?: { aspectRequired?: boolean; aspectUsage?: string };
        aspectValues?: { localizedValue: string }[];
      }[];
    }>("GET", `/commerce/taxonomy/v1/category_tree/${tree}/get_item_aspects_for_category`, {
      app: true,
      query: { category_id: categoryId },
    });
    return (r.aspects ?? [])
      .filter((a) => a.aspectConstraint?.aspectRequired || a.aspectConstraint?.aspectUsage === "RECOMMENDED")
      .slice(0, 25)
      .map((a) => ({
        name: a.localizedAspectName,
        required: !!a.aspectConstraint?.aspectRequired,
        values: (a.aspectValues ?? []).slice(0, 30).map((v) => v.localizedValue),
      }));
  }

  // ---------- Account setup ----------

  async getPolicies(): Promise<Policies> {
    const m = this.cfg.ebay.marketplaceId;
    const [f, p, r] = await Promise.all([
      this.api<{ fulfillmentPolicies?: { fulfillmentPolicyId: string; name: string }[] }>("GET", "/sell/account/v1/fulfillment_policy", { query: { marketplace_id: m } }),
      this.api<{ paymentPolicies?: { paymentPolicyId: string; name: string }[] }>("GET", "/sell/account/v1/payment_policy", { query: { marketplace_id: m } }),
      this.api<{ returnPolicies?: { returnPolicyId: string; name: string }[] }>("GET", "/sell/account/v1/return_policy", { query: { marketplace_id: m } }),
    ]);
    return {
      fulfillment: (f.fulfillmentPolicies ?? []).map((x) => ({ id: x.fulfillmentPolicyId, name: x.name })),
      payment: (p.paymentPolicies ?? []).map((x) => ({ id: x.paymentPolicyId, name: x.name })),
      return: (r.returnPolicies ?? []).map((x) => ({ id: x.returnPolicyId, name: x.name })),
    };
  }

  async createLocation(key: string, addr: { city: string; state: string; zip: string; country: string }): Promise<void> {
    if (this.dryRun) return this.dry(`create location ${key}`);
    await this.api("POST", `/sell/inventory/v1/location/${encodeURIComponent(key)}`, {
      body: {
        location: { address: { city: addr.city, stateOrProvince: addr.state, postalCode: addr.zip, country: addr.country } },
        locationTypes: ["WAREHOUSE"],
        name: key,
        merchantLocationStatus: "ENABLED",
      },
    });
  }

  // ---------- Listing ----------

  async upsertInventoryItem(item: InventoryItem): Promise<void> {
    if (this.dryRun) return this.dry(`upsert inventory item ${item.sku} "${item.title}"`);
    await this.api("PUT", `/sell/inventory/v1/inventory_item/${encodeURIComponent(item.sku)}`, {
      body: {
        condition: "NEW",
        availability: { shipToLocationAvailability: { quantity: item.quantity } },
        product: {
          title: item.title,
          description: item.description,
          aspects: item.aspects,
          imageUrls: item.imageUrls.slice(0, 12),
        },
      },
    });
  }

  async createOffer(o: OfferInput): Promise<string> {
    if (this.dryRun) {
      this.dry(`create offer ${o.sku} $${o.price}`);
      return `DRY-OFFER-${o.sku}`;
    }
    try {
      const r = await this.api<{ offerId: string }>("POST", "/sell/inventory/v1/offer", { body: this.offerBody(o) });
      return r.offerId;
    } catch (err) {
      // Offer already exists for this SKU: reuse it.
      if (err instanceof HttpError && err.body.includes("offerId")) {
        const m = err.body.match(/"offerId"\s*,\s*"value"\s*:\s*"(\d+)"/) ?? err.body.match(/offerId[^0-9]*(\d+)/);
        if (m) {
          await this.api("PUT", `/sell/inventory/v1/offer/${m[1]}`, { body: this.offerBody(o) });
          return m[1]!;
        }
      }
      throw err;
    }
  }

  private offerBody(o: OfferInput) {
    return {
      sku: o.sku,
      marketplaceId: this.cfg.ebay.marketplaceId,
      format: "FIXED_PRICE",
      availableQuantity: o.quantity,
      categoryId: o.categoryId,
      listingDescription: o.description,
      merchantLocationKey: o.merchantLocationKey,
      listingPolicies: {
        fulfillmentPolicyId: o.fulfillmentPolicyId,
        paymentPolicyId: o.paymentPolicyId,
        returnPolicyId: o.returnPolicyId,
      },
      pricingSummary: { price: { value: o.price.toFixed(2), currency: this.cfg.ebay.currency } },
    };
  }

  async publishOffer(offerId: string): Promise<string> {
    if (this.dryRun) {
      this.dry(`publish offer ${offerId}`);
      return `DRY-LISTING-${offerId}`;
    }
    const r = await this.api<{ listingId: string }>("POST", `/sell/inventory/v1/offer/${offerId}/publish`);
    return r.listingId;
  }

  async withdrawOffer(offerId: string): Promise<void> {
    if (this.dryRun) return this.dry(`withdraw offer ${offerId}`);
    await this.api("POST", `/sell/inventory/v1/offer/${offerId}/withdraw`);
  }

  async updatePriceQuantity(updates: { sku: string; offerId: string; price: number; quantity: number }[]): Promise<void> {
    for (let i = 0; i < updates.length; i += 25) {
      const batch = updates.slice(i, i + 25);
      if (this.dryRun) {
        this.dry(`bulk price/qty update: ${batch.map((u) => `${u.sku}=$${u.price}x${u.quantity}`).join(", ")}`);
        continue;
      }
      await this.api("POST", "/sell/inventory/v1/bulk_update_price_quantity", {
        body: {
          requests: batch.map((u) => ({
            sku: u.sku,
            shipToLocationAvailability: { quantity: u.quantity },
            offers: [
              { offerId: u.offerId, availableQuantity: u.quantity, price: { value: u.price.toFixed(2), currency: this.cfg.ebay.currency } },
            ],
          })),
        },
      });
    }
  }

  // ---------- Orders ----------

  async getOpenOrders(): Promise<EbayOrder[]> {
    type Raw = {
      orderId: string;
      orderPaymentStatus?: string;
      cancelStatus?: { cancelState?: string };
      buyer?: { username?: string };
      pricingSummary?: { total?: { value: string; currency: string } };
      fulfillmentStartInstructions?: {
        shippingStep?: {
          shipTo?: {
            fullName?: string;
            primaryPhone?: { phoneNumber?: string };
            contactAddress?: {
              addressLine1?: string;
              addressLine2?: string;
              city?: string;
              stateOrProvince?: string;
              postalCode?: string;
              countryCode?: string;
            };
          };
        };
      }[];
      lineItems?: { lineItemId: string; sku?: string; title: string; quantity: number; lineItemCost?: { value: string } }[];
    };
    const res = await this.api<{ orders?: Raw[] }>("GET", "/sell/fulfillment/v1/order", {
      query: { filter: "orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}", limit: "100" },
    });
    return (res.orders ?? []).map((o) => {
      const st = o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo;
      const a = st?.contactAddress ?? {};
      return {
        orderId: o.orderId,
        buyer: o.buyer?.username ?? "",
        total: Number(o.pricingSummary?.total?.value ?? 0),
        currency: o.pricingSummary?.total?.currency ?? "USD",
        cancelled: !!o.cancelStatus?.cancelState && o.cancelStatus.cancelState !== "NONE_REQUESTED",
        paid: o.orderPaymentStatus === "PAID",
        shipTo: {
          name: st?.fullName ?? "",
          phone: st?.primaryPhone?.phoneNumber ?? "0000000000",
          address1: a.addressLine1 ?? "",
          address2: a.addressLine2 ?? "",
          city: a.city ?? "",
          state: a.stateOrProvince ?? "",
          zip: a.postalCode ?? "",
          countryCode: a.countryCode ?? "US",
        },
        lineItems: (o.lineItems ?? []).map((li) => ({
          lineItemId: li.lineItemId,
          sku: li.sku ?? "",
          title: li.title,
          quantity: li.quantity,
          price: Number(li.lineItemCost?.value ?? 0),
        })),
      };
    });
  }

  async addTracking(orderId: string, lineItems: { lineItemId: string; quantity: number }[], carrier: string, tracking: string) {
    if (this.dryRun) return this.dry(`add tracking ${orderId}: ${carrier} ${tracking}`);
    await this.api("POST", `/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`, {
      body: {
        lineItems,
        shippedDate: new Date().toISOString(),
        shippingCarrierCode: carrier,
        trackingNumber: tracking,
      },
    });
  }
}

// The automation engine. Each public method is one job the scheduler runs
// and the dashboard can trigger by hand.

import type { ListingWriter } from "../ai/listing.ts";
import type { DB } from "../db.ts";
import { log } from "../db.ts";
import type { EbayClient } from "../ebay/client.ts";
import { mapCarrier } from "../ebay/client.ts";
import { checkProductSafety } from "../filters.ts";
import type { Notifier } from "../notify.ts";
import { computePrice } from "../pricing.ts";
import { scoreCandidate } from "../research.ts";
import { getSettings, type Settings } from "../settings.ts";
import type { Supplier } from "../suppliers/types.ts";

export type ProductRow = {
  id: number;
  sku: string;
  supplier: string;
  supplier_product_id: string;
  supplier_variant_id: string;
  keyword: string | null;
  title: string;
  description: string | null;
  images: string;
  cost: number;
  shipping_cost: number;
  shipping_days: string | null;
  logistic_name: string | null;
  stock: number;
  price: number;
  profit: number;
  competitor_count: number | null;
  competitor_median: number | null;
  score: number;
  score_notes: string | null;
  status: string;
  ebay_title: string | null;
  ebay_description: string | null;
  ebay_aspects: string | null;
  ebay_category_id: string | null;
  ebay_offer_id: string | null;
  ebay_listing_id: string | null;
  last_error: string | null;
};

export type OrderRow = {
  id: number;
  ebay_order_id: string;
  buyer: string | null;
  total: number | null;
  currency: string | null;
  ship_to: string;
  line_items: string;
  status: string;
  supplier_order_id: string | null;
  supplier_cost: number | null;
  tracking_number: string | null;
  carrier: string | null;
  note: string | null;
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class Engine {
  db: DB;
  supplier: Supplier;
  ebay: EbayClient;
  writer: ListingWriter;
  notify: Notifier;
  private running = new Set<string>();

  constructor(opts: { db: DB; supplier: Supplier; ebay: EbayClient; writer: ListingWriter; notify: Notifier }) {
    this.db = opts.db;
    this.supplier = opts.supplier;
    this.ebay = opts.ebay;
    this.writer = opts.writer;
    this.notify = opts.notify;
  }

  settings(): Settings {
    return getSettings(this.db);
  }

  /** Prevents the same job from overlapping with itself. */
  async exclusive<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (this.running.has(name)) {
      log(this.db, "warn", name, "already running, skipped");
      return undefined;
    }
    this.running.add(name);
    try {
      return await fn();
    } catch (err) {
      log(this.db, "error", name, errMsg(err));
      return undefined;
    } finally {
      this.running.delete(name);
    }
  }

  // ======================= RESEARCH =======================

  async runResearch(): Promise<{ added: number }> {
    const s = this.settings();
    const keywords = s.keywords.split(",").map((k) => k.trim()).filter(Boolean);
    let added = 0;
    for (const kw of keywords) {
      try {
        added += await this.researchKeyword(kw, s);
      } catch (err) {
        log(this.db, "error", "research", `"${kw}": ${errMsg(err)}`);
      }
    }
    log(this.db, "info", "research", `done: ${added} new candidates from ${keywords.length} keywords`);
    if (s.autoApproveMinScore > 0) await this.autoApprove();
    return { added };
  }

  async researchKeyword(keyword: string, s: Settings = this.settings()): Promise<number> {
    const hits = await this.supplier.search(keyword, s.productsPerKeyword);
    const countries = s.shipFromCountries.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    const exists = this.db.prepare("SELECT 1 FROM products WHERE supplier = ? AND supplier_product_id = ?");
    let added = 0;

    for (const hit of hits) {
      if (exists.get(this.supplier.name, hit.productId)) continue;
      const safety = checkProductSafety(hit.title);
      if (!safety.ok) {
        log(this.db, "info", "research", `skip "${hit.title.slice(0, 60)}": ${safety.reason}`);
        continue;
      }
      try {
        const product = await this.supplier.getProduct(hit.productId);
        const fullSafety = checkProductSafety(product.title, product.description);
        if (!fullSafety.ok || !product.variants.length || !product.images.length) continue;

        // Cheapest variant that has enough stock in an accepted warehouse.
        const variants = [...product.variants].sort((a, b) => a.price - b.price).slice(0, 5);
        let picked: { v: (typeof variants)[number]; stock: number; country: string } | null = null;
        for (const v of variants) {
          const st = await this.supplier.getStock(v.variantId, countries);
          const country = countries.find((c) => (st.byCountry[c] ?? 0) >= s.minStock);
          if (country) {
            picked = { v, stock: st.byCountry[country] ?? 0, country };
            break;
          }
        }
        if (!picked) continue;

        const quote = await this.supplier.quoteShipping(picked.v.variantId, picked.country, "US");
        if (!quote) continue;

        const pricing = computePrice({ cost: picked.v.price, shippingCost: quote.price }, s);
        let market = null;
        try {
          market = await this.ebay.marketSnapshot(product.title.split(/\s+/).slice(0, 6).join(" "));
        } catch (err) {
          log(this.db, "warn", "research", `market data unavailable: ${errMsg(err)}`);
        }
        const sc = scoreCandidate(
          { price: pricing.price, profit: pricing.profit, stock: picked.stock, shippingDays: quote.days, market },
          s,
        );
        if (sc.reject) {
          log(this.db, "info", "research", `skip "${product.title.slice(0, 60)}": ${sc.reject}`);
          continue;
        }

        const sku = `${this.supplier.name.toUpperCase()}-${picked.v.variantId}`.slice(0, 50);
        this.db
          .prepare(
            `INSERT OR IGNORE INTO products (sku, supplier, supplier_product_id, supplier_variant_id, keyword, title, description,
              images, cost, shipping_cost, shipping_days, logistic_name, stock, price, profit, competitor_count,
              competitor_median, score, score_notes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate')`,
          )
          .run(
            sku,
            this.supplier.name,
            product.productId,
            picked.v.variantId,
            keyword,
            picked.v.name ? `${product.title} - ${picked.v.name}` : product.title,
            product.description,
            JSON.stringify([...(picked.v.image ? [picked.v.image] : []), ...product.images].filter((x, i, a) => a.indexOf(x) === i)),
            picked.v.price,
            quote.price,
            quote.days === null ? null : String(quote.days),
            `${quote.fromCountry}|${quote.logisticName}`,
            picked.stock,
            pricing.price,
            pricing.profit,
            market?.total ?? null,
            sc.competitorMedian,
            sc.score,
            sc.notes.join("; "),
          );
        added++;
      } catch (err) {
        log(this.db, "warn", "research", `product ${hit.productId}: ${errMsg(err)}`);
      }
    }
    return added;
  }

  // ======================= LISTING =======================

  private activeListingCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'listed'").get() as { n: number }).n;
  }

  private listedToday(): number {
    return (
      this.db
        .prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'listed' AND date(updated_at) = date('now')")
        .get() as { n: number }
    ).n;
  }

  async autoApprove(): Promise<number> {
    const s = this.settings();
    const room = Math.min(s.maxActiveListings - this.activeListingCount(), s.dailyListingLimit - this.listedToday());
    if (room <= 0) {
      log(this.db, "info", "listing", "listing limit reached, auto-approve paused");
      return 0;
    }
    const rows = this.db
      .prepare("SELECT id FROM products WHERE status = 'candidate' AND score >= ? ORDER BY score DESC LIMIT ?")
      .all(s.autoApproveMinScore, room) as { id: number }[];
    let n = 0;
    for (const r of rows) if (await this.publish(r.id)) n++;
    if (n) await this.notify(`Auto-listed ${n} new product(s) on eBay.`);
    return n;
  }

  reject(id: number): void {
    this.db.prepare("UPDATE products SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(id);
  }

  setupProblems(s: Settings = this.settings()): string[] {
    const p: string[] = [];
    if (!this.ebay.isConnected()) p.push("eBay hesabı qoşulmayıb");
    if (!s.fulfillmentPolicyId || !s.paymentPolicyId || !s.returnPolicyId) p.push("eBay business policies seçilməyib");
    if (!s.merchantLocationKey) p.push("eBay inventory location yaradılmayıb");
    return p;
  }

  async publish(id: number): Promise<boolean> {
    const s = this.settings();
    const row = this.db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | undefined;
    if (!row) return false;
    const problems = this.ebay.dryRun ? [] : this.setupProblems(s);
    if (problems.length) {
      this.setError(id, problems.join("; "));
      log(this.db, "warn", "listing", `cannot publish ${row.sku}: ${problems.join("; ")}`);
      return false;
    }
    try {
      this.db.prepare("UPDATE products SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(id);

      // Category + item specifics
      let categoryId = row.ebay_category_id;
      let categoryName: string | null = null;
      let aspects: { name: string; required: boolean; values: string[] }[] = [];
      if (!categoryId) {
        let cat: { id: string; name: string } | null = null;
        try {
          cat = await this.ebay.suggestCategory(row.title.split(/\s+/).slice(0, 8).join(" "));
        } catch (err) {
          if (!this.ebay.dryRun) throw err;
          log(this.db, "warn", "listing", `[DRY_RUN] category lookup failed (${errMsg(err)}), using placeholder`);
          cat = { id: "0", name: "unknown" };
        }
        if (!cat) throw new Error("no eBay category found");
        categoryId = cat.id;
        categoryName = cat.name;
      }
      try {
        aspects = await this.ebay.requiredAspects(categoryId);
      } catch (err) {
        log(this.db, "warn", "listing", `aspects for ${categoryId}: ${errMsg(err)}`);
      }

      // AI content
      const [baseTitle, variantName = ""] = row.title.split(" - ");
      const draft = await this.writer.write({
        supplierTitle: baseTitle ?? row.title,
        supplierDescription: row.description ?? "",
        variantName,
        categoryName,
        aspects,
        handlingDays: s.handlingDays,
        shippingDays: row.shipping_days ? Number(row.shipping_days) : null,
      });
      const safety = checkProductSafety(draft.title, draft.description);
      if (!safety.ok) throw new Error(`generated listing failed safety check: ${safety.reason}`);

      const qty = Math.min(s.listingQuantity, row.stock);
      await this.ebay.upsertInventoryItem({
        sku: row.sku,
        title: draft.title,
        description: draft.description,
        aspects: draft.aspects,
        imageUrls: JSON.parse(row.images) as string[],
        quantity: qty,
      });
      const offerId = await this.ebay.createOffer({
        sku: row.sku,
        categoryId,
        price: row.price,
        quantity: qty,
        description: draft.description,
        fulfillmentPolicyId: s.fulfillmentPolicyId,
        paymentPolicyId: s.paymentPolicyId,
        returnPolicyId: s.returnPolicyId,
        merchantLocationKey: s.merchantLocationKey,
      });
      const listingId = await this.ebay.publishOffer(offerId);

      this.db
        .prepare(
          `UPDATE products SET status = 'listed', ebay_title = ?, ebay_description = ?, ebay_aspects = ?, ebay_category_id = ?,
             ebay_offer_id = ?, ebay_listing_id = ?, last_error = NULL, updated_at = datetime('now') WHERE id = ?`,
        )
        .run(draft.title, draft.description, JSON.stringify(draft.aspects), categoryId, offerId, listingId, id);
      log(this.db, "info", "listing", `listed ${row.sku} "${draft.title}" at $${row.price} (listing ${listingId})`);
      return true;
    } catch (err) {
      this.setError(id, errMsg(err));
      log(this.db, "error", "listing", `${row.sku}: ${errMsg(err)}`);
      return false;
    }
  }

  private setError(id: number, msg: string) {
    this.db
      .prepare("UPDATE products SET status = 'error', last_error = ?, updated_at = datetime('now') WHERE id = ?")
      .run(msg.slice(0, 1000), id);
  }

  async endListing(id: number): Promise<void> {
    const row = this.db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | undefined;
    if (!row?.ebay_offer_id) return;
    await this.ebay.withdrawOffer(row.ebay_offer_id);
    this.db.prepare("UPDATE products SET status = 'ended', updated_at = datetime('now') WHERE id = ?").run(id);
    log(this.db, "info", "listing", `ended ${row.sku}`);
  }

  // ======================= STOCK & PRICE SYNC =======================

  async syncListings(): Promise<{ checked: number; updated: number }> {
    const s = this.settings();
    const countries = s.shipFromCountries.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    const rows = this.db
      .prepare("SELECT * FROM products WHERE status IN ('listed', 'paused') AND ebay_offer_id IS NOT NULL")
      .all() as ProductRow[];
    const updates: { sku: string; offerId: string; price: number; quantity: number }[] = [];
    const alerts: string[] = [];

    for (const row of rows) {
      try {
        const [fromCountry] = (row.logistic_name ?? "").split("|");
        const product = await this.supplier.getProduct(row.supplier_product_id);
        const variant = product.variants.find((v) => v.variantId === row.supplier_variant_id);
        const stock = variant ? await this.supplier.getStock(variant.variantId, countries) : { total: 0, byCountry: {} as Record<string, number> };
        const available = fromCountry ? stock.byCountry[fromCountry] ?? 0 : stock.total;

        let cost = row.cost;
        let shipping = row.shipping_cost;
        if (variant) cost = variant.price;
        if (variant && fromCountry) {
          const q = await this.supplier.quoteShipping(variant.variantId, fromCountry, "US");
          if (q) shipping = q.price;
        }
        const pricing = computePrice({ cost, shippingCost: shipping }, s);
        const outOfStock = !variant || available < Math.max(3, Math.floor(s.minStock / 4));
        const qty = outOfStock ? 0 : Math.min(s.listingQuantity, available);
        const newStatus = outOfStock ? "paused" : "listed";

        const priceChanged = Math.abs(pricing.price - row.price) >= 0.01;
        if (priceChanged || newStatus !== row.status || row.stock !== available) {
          updates.push({ sku: row.sku, offerId: row.ebay_offer_id!, price: pricing.price, quantity: qty });
          if (newStatus !== row.status) alerts.push(`${row.sku}: ${outOfStock ? "out of stock, paused" : "back in stock"}`);
          if (priceChanged) alerts.push(`${row.sku}: price $${row.price} -> $${pricing.price} (cost $${row.cost} -> $${cost})`);
        }
        this.db
          .prepare(
            `UPDATE products SET cost = ?, shipping_cost = ?, stock = ?, price = ?, profit = ?, status = ?,
               last_synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
          )
          .run(cost, shipping, available, pricing.price, pricing.profit, newStatus, row.id);
      } catch (err) {
        log(this.db, "warn", "sync", `${row.sku}: ${errMsg(err)}`);
      }
    }

    if (updates.length) await this.ebay.updatePriceQuantity(updates);
    log(this.db, "info", "sync", `checked ${rows.length}, updated ${updates.length}`);
    if (alerts.length) await this.notify(`Stock/price sync:\n${alerts.slice(0, 30).join("\n")}`);
    return { checked: rows.length, updated: updates.length };
  }

  // ======================= ORDERS =======================

  async processOrders(): Promise<{ imported: number; fulfilled: number }> {
    const s = this.settings();
    const orders = await this.ebay.getOpenOrders();
    let imported = 0;
    let fulfilled = 0;

    for (const o of orders) {
      const existing = this.db.prepare("SELECT * FROM orders WHERE ebay_order_id = ?").get(o.orderId) as OrderRow | undefined;
      if (!existing) {
        if (o.cancelled) continue;
        this.db
          .prepare("INSERT INTO orders (ebay_order_id, buyer, total, currency, ship_to, line_items, status) VALUES (?, ?, ?, ?, ?, ?, 'new')")
          .run(o.orderId, o.buyer, o.total, o.currency, JSON.stringify(o.shipTo), JSON.stringify(o.lineItems));
        imported++;
        log(this.db, "info", "orders", `new order ${o.orderId} $${o.total} from ${o.buyer}`);
        await this.notify(`New eBay order ${o.orderId}: $${o.total} - ${o.lineItems.map((l) => `${l.quantity}x ${l.title}`).join(", ")}`);
      } else if (o.cancelled && existing.status !== "cancelled") {
        this.db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(existing.id);
        const msg = existing.supplier_order_id
          ? `Order ${o.orderId} was CANCELLED by buyer, but supplier order ${existing.supplier_order_id} exists. Cancel it in CJ!`
          : `Order ${o.orderId} was cancelled.`;
        log(this.db, "warn", "orders", msg);
        await this.notify(msg);
        continue;
      }

      const row = this.db.prepare("SELECT * FROM orders WHERE ebay_order_id = ?").get(o.orderId) as OrderRow;
      if (row.status === "new" && s.autoFulfill && o.paid && !o.cancelled) {
        if (await this.fulfill(row.id)) fulfilled++;
      }
    }
    return { imported, fulfilled };
  }

  async fulfill(orderId: number): Promise<boolean> {
    const s = this.settings();
    const row = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as OrderRow | undefined;
    if (!row || row.supplier_order_id) return false;
    const shipTo = JSON.parse(row.ship_to);
    const lines = JSON.parse(row.line_items) as { sku: string; quantity: number; title: string }[];

    const items: { variantId: string; quantity: number }[] = [];
    let fromCountry: string | undefined;
    let logisticName: string | undefined;
    for (const li of lines) {
      const p = this.db.prepare("SELECT * FROM products WHERE sku = ?").get(li.sku) as ProductRow | undefined;
      if (!p) return this.attention(row, `unknown SKU "${li.sku}" (item not listed by this system)`);
      items.push({ variantId: p.supplier_variant_id, quantity: li.quantity });
      [fromCountry, logisticName] = (p.logistic_name ?? "").split("|");
    }
    if (!shipTo.address1 || !shipTo.zip) return this.attention(row, "shipping address is incomplete");

    if (this.ebay.dryRun) {
      log(this.db, "info", "orders", `[DRY_RUN] would order ${JSON.stringify(items)} from ${this.supplier.name} for ${row.ebay_order_id}`);
      return false;
    }
    try {
      const res = await this.supplier.createOrder({ reference: row.ebay_order_id, shipTo, items, fromCountry, logisticName });
      let status = "supplier_ordered";
      let note: string | null = null;
      if (s.autoPaySupplier) {
        try {
          await this.supplier.payOrder(res.orderId);
        } catch (err) {
          status = "awaiting_payment";
          note = `auto-pay failed: ${errMsg(err)}`;
        }
      } else {
        status = "awaiting_payment";
      }
      this.db
        .prepare("UPDATE orders SET status = ?, supplier_order_id = ?, supplier_cost = ?, note = ?, updated_at = datetime('now') WHERE id = ?")
        .run(status, res.orderId, res.cost, note, row.id);
      log(this.db, "info", "orders", `${row.ebay_order_id} -> supplier order ${res.orderId} (${status})`);
      if (status === "awaiting_payment") {
        await this.notify(`Order ${row.ebay_order_id}: supplier order ${res.orderId} created, PAYMENT NEEDED in CJ. ${note ?? ""}`);
      }
      return true;
    } catch (err) {
      return this.attention(row, `supplier order failed: ${errMsg(err)}`);
    }
  }

  private async attention(row: OrderRow, reason: string): Promise<false> {
    this.db
      .prepare("UPDATE orders SET status = 'needs_attention', note = ?, updated_at = datetime('now') WHERE id = ?")
      .run(reason.slice(0, 1000), row.id);
    log(this.db, "error", "orders", `${row.ebay_order_id}: ${reason}`);
    await this.notify(`ATTENTION order ${row.ebay_order_id}: ${reason}`);
    return false;
  }

  markPaid(orderId: number): void {
    this.db
      .prepare("UPDATE orders SET status = 'supplier_ordered', note = NULL, updated_at = datetime('now') WHERE id = ? AND status = 'awaiting_payment'")
      .run(orderId);
  }

  // ======================= TRACKING =======================

  async updateTracking(): Promise<{ shipped: number }> {
    const rows = this.db
      .prepare("SELECT * FROM orders WHERE status IN ('supplier_ordered', 'awaiting_payment') AND supplier_order_id IS NOT NULL")
      .all() as OrderRow[];
    let shipped = 0;
    for (const row of rows) {
      try {
        const st = await this.supplier.getOrder(row.supplier_order_id!);
        if (st.cancelled) {
          await this.attention(row, `supplier cancelled order ${row.supplier_order_id} (${st.status})`);
          continue;
        }
        if (!st.trackingNumber) continue;
        const carrier = mapCarrier(st.carrier, st.trackingNumber);
        const lines = JSON.parse(row.line_items) as { lineItemId: string; quantity: number }[];
        await this.ebay.addTracking(
          row.ebay_order_id,
          lines.map((l) => ({ lineItemId: l.lineItemId, quantity: l.quantity })),
          carrier,
          st.trackingNumber,
        );
        this.db
          .prepare("UPDATE orders SET status = 'shipped', tracking_number = ?, carrier = ?, updated_at = datetime('now') WHERE id = ?")
          .run(st.trackingNumber, carrier, row.id);
        shipped++;
        log(this.db, "info", "tracking", `${row.ebay_order_id}: ${carrier} ${st.trackingNumber} uploaded`);
      } catch (err) {
        log(this.db, "warn", "tracking", `${row.ebay_order_id}: ${errMsg(err)}`);
      }
    }
    return { shipped };
  }
}

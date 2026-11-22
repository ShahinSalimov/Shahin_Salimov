// Everything you would otherwise do on the eBay / CJ websites:
// buyer messages, returns/cancellations/INR cases, money, CJ wallet,
// listing edits. Jobs here run on the scheduler; actions are dashboard buttons.

import { activity, log } from "../db.ts";
import { FinancesApi } from "../ebay/finances.ts";
import { PostOrderApi, type EbayCase } from "../ebay/postorder.ts";
import { TradingApi } from "../ebay/trading.ts";
import { profitAt } from "../pricing.ts";
import type { Engine, OrderRow, ProductRow } from "./engine.ts";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type MessageRow = {
  id: number;
  ebay_message_id: string;
  direction: "in" | "out";
  sender: string | null;
  recipient: string | null;
  item_id: string | null;
  item_title: string | null;
  subject: string | null;
  body: string;
  status: string;
  ai_draft: string | null;
  error: string | null;
  received_at: string | null;
  created_at: string;
};

export type CaseRow = {
  id: number;
  kind: "return" | "cancel" | "inquiry";
  ebay_case_id: string;
  ebay_order_id: string | null;
  buyer: string | null;
  reason: string | null;
  comment: string | null;
  state: string | null;
  amount: number | null;
  open: number;
  handled: string | null;
  opened_at: string | null;
};

const CASE_AZ = { return: "Return", cancel: "Ləğv sorğusu", inquiry: "Item not received" } as const;

export class Ops {
  private e: Engine;
  trading: TradingApi;
  postOrder: PostOrderApi;
  finances: FinancesApi;

  constructor(engine: Engine) {
    this.e = engine;
    this.trading = new TradingApi(engine.ebay);
    this.postOrder = new PostOrderApi(engine.ebay);
    this.finances = new FinancesApi(engine.ebay);
  }

  private get db() {
    return this.e.db;
  }

  /** Our order that a buyer / case belongs to. */
  findOrder(ref: { orderId?: string; buyer?: string; itemId?: string }): (OrderRow & { created_at: string }) | undefined {
    const q = (sql: string, v: string) => this.db.prepare(sql).get(v) as (OrderRow & { created_at: string }) | undefined;
    if (ref.orderId) {
      const byId = q("SELECT * FROM orders WHERE ebay_order_id = ?", ref.orderId);
      if (byId) return byId;
      const itemId = ref.orderId.split("-")[0];
      if (itemId && /^\d{9,}$/.test(itemId)) {
        const byItem = q("SELECT * FROM orders WHERE line_items LIKE ? ORDER BY id DESC", `%"itemId":"${itemId}"%`);
        if (byItem) return byItem;
      }
    }
    if (ref.buyer) return q("SELECT * FROM orders WHERE buyer = ? ORDER BY id DESC", ref.buyer);
    return undefined;
  }

  private orderInfo(o: OrderRow | undefined): string {
    if (!o) return "";
    const items = (JSON.parse(o.line_items) as { title: string; quantity: number }[]).map((l) => `${l.quantity}x ${l.title}`).join(", ");
    return [
      `Order ${o.ebay_order_id}: ${items}`,
      `status: ${o.status}`,
      o.tracking_number ? `tracking: ${o.carrier} ${o.tracking_number}` : "not shipped yet",
      o.status === "shipped" ? "Delivery usually takes 5-12 business days after shipping." : "",
    ]
      .filter(Boolean)
      .join("; ");
  }

  // ======================= MESSAGES =======================

  async syncMessages(): Promise<{ added: number }> {
    const s = this.e.settings();
    const list = await this.trading.getMessages(14);
    const exists = this.db.prepare("SELECT status FROM messages WHERE ebay_message_id = ?");
    let added = 0;
    for (const m of list) {
      const row = exists.get(m.messageId) as { status: string } | undefined;
      const status = /answered/i.test(m.status) && !/unanswered/i.test(m.status) ? "answered" : "unanswered";
      if (row) {
        if (row.status === "unanswered" && status === "answered") {
          this.db.prepare("UPDATE messages SET status = 'answered' WHERE ebay_message_id = ?").run(m.messageId);
        }
        continue;
      }
      this.db
        .prepare(
          `INSERT INTO messages (ebay_message_id, direction, sender, recipient, item_id, item_title, subject, body, status, received_at)
           VALUES (?, 'in', ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(m.messageId, m.sender, m.recipient, m.itemId, m.itemTitle, m.subject, m.body, status, m.createdAt);
      added++;
      if (status !== "unanswered") continue;

      activity(this.db, "message", `Yeni mesaj, ${m.sender}: "${m.body.slice(0, 140)}"`, this.findOrder({ buyer: m.sender })?.ebay_order_id ?? null);
      await this.e.notify(`Yeni alıcı mesajı (${m.sender}):\n${m.body.slice(0, 600)}`);

      if (s.autoDraftReplies && this.e.writer.enabled) {
        try {
          const draft = await this.e.writer.draftReply({
            buyerMessage: `${m.subject}\n${m.body}`,
            orderInfo: this.orderInfo(this.findOrder({ buyer: m.sender })) || `Listing: ${m.itemTitle}`,
          });
          this.db.prepare("UPDATE messages SET ai_draft = ? WHERE ebay_message_id = ?").run(draft, m.messageId);
          if (s.autoSendReplies) {
            const id = (this.db.prepare("SELECT id FROM messages WHERE ebay_message_id = ?").get(m.messageId) as { id: number }).id;
            await this.reply(id, draft, true);
          }
        } catch (err) {
          log(this.db, "warn", "messages", `AI draft for ${m.messageId}: ${errMsg(err)}`);
        }
      }
    }
    return { added };
  }

  async draft(messageId: number): Promise<string> {
    const m = this.db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as MessageRow | undefined;
    if (!m) throw new Error("mesaj tapılmadı");
    const text = await this.e.writer.draftReply({
      buyerMessage: `${m.subject ?? ""}\n${m.body}`,
      orderInfo: this.orderInfo(this.findOrder({ buyer: m.sender ?? "" })) || `Listing: ${m.item_title ?? ""}`,
    });
    this.db.prepare("UPDATE messages SET ai_draft = ? WHERE id = ?").run(text, messageId);
    return text;
  }

  async reply(messageId: number, body: string, auto = false): Promise<void> {
    const m = this.db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as MessageRow | undefined;
    if (!m) throw new Error("mesaj tapılmadı");
    if (!this.e.ebay.dryRun) {
      await this.trading.reply({ itemId: m.item_id ?? "", parentMessageId: m.ebay_message_id, recipient: m.sender ?? "", body });
    }
    this.db
      .prepare(
        `INSERT INTO messages (ebay_message_id, direction, sender, recipient, item_id, item_title, subject, body, status, received_at)
         VALUES (?, 'out', 'me', ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(`out-${messageId}-${Date.now()}`, m.sender, m.item_id, m.item_title, `Re: ${m.subject ?? ""}`, body, this.e.ebay.dryRun ? "dry_run" : "sent");
    this.db.prepare("UPDATE messages SET status = 'answered' WHERE id = ?").run(messageId);
    activity(this.db, "message", `${auto ? "AI avtomatik cavab verdi" : "Cavab göndərildi"} → ${m.sender}: "${body.slice(0, 120)}"`, this.findOrder({ buyer: m.sender ?? "" })?.ebay_order_id ?? null);
  }

  async messageBuyer(orderId: number, subject: string, body: string): Promise<void> {
    const o = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as OrderRow | undefined;
    if (!o) throw new Error("sifariş tapılmadı");
    const itemId = (JSON.parse(o.line_items) as { itemId?: string }[])[0]?.itemId ?? "";
    if (!itemId) throw new Error("eBay item ID yoxdur");
    if (!this.e.ebay.dryRun) await this.trading.messageBuyer({ itemId, buyer: o.buyer ?? "", subject, body });
    this.db
      .prepare(
        `INSERT INTO messages (ebay_message_id, direction, sender, recipient, item_id, subject, body, status, received_at)
         VALUES (?, 'out', 'me', ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(`out-o${orderId}-${Date.now()}`, o.buyer, itemId, subject, body, this.e.ebay.dryRun ? "dry_run" : "sent");
    activity(this.db, "message", `Alıcıya mesaj göndərildi (${o.buyer}): "${body.slice(0, 120)}"`, o.ebay_order_id);
  }

  // ======================= RETURNS / CANCELS / INR =======================

  async syncCases(): Promise<{ new: number }> {
    const all: EbayCase[] = [];
    for (const [name, fn] of [
      ["return", () => this.postOrder.returns()],
      ["cancel", () => this.postOrder.cancellations()],
      ["inquiry", () => this.postOrder.inquiries()],
    ] as const) {
      try {
        all.push(...(await fn()));
      } catch (err) {
        log(this.db, "warn", "cases", `${name}: ${errMsg(err)}`);
      }
    }
    let created = 0;
    for (const c of all) {
      const prev = this.db.prepare("SELECT * FROM cases WHERE kind = ? AND ebay_case_id = ?").get(c.kind, c.caseId) as CaseRow | undefined;
      const order = this.findOrder({ orderId: c.orderId, buyer: c.buyer });
      const orderRef = order?.ebay_order_id ?? (c.orderId || null);
      if (!prev) {
        this.db
          .prepare(
            `INSERT INTO cases (kind, ebay_case_id, ebay_order_id, buyer, reason, comment, state, amount, open, opened_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(c.kind, c.caseId, orderRef, c.buyer, c.reason, c.comment, c.state, c.amount, c.open ? 1 : 0, c.openedAt);
        if (!c.open) continue;
        created++;
        const text = `${CASE_AZ[c.kind]} açıldı (${c.buyer || "alıcı"}): ${c.reason}${c.comment ? ` — "${c.comment.slice(0, 120)}"` : ""}`;
        activity(this.db, c.kind, text, orderRef);
        await this.e.notify(`${text}\nSifariş: ${orderRef ?? "?"}`);
        const row = this.db.prepare("SELECT * FROM cases WHERE kind = ? AND ebay_case_id = ?").get(c.kind, c.caseId) as CaseRow;
        await this.autoHandle(row, order);
      } else if (prev.state !== c.state || prev.open !== (c.open ? 1 : 0)) {
        this.db
          .prepare("UPDATE cases SET state = ?, open = ?, amount = COALESCE(?, amount), updated_at = datetime('now') WHERE id = ?")
          .run(c.state, c.open ? 1 : 0, c.amount, prev.id);
        if (!c.open && prev.open) activity(this.db, c.kind, `${CASE_AZ[c.kind]} bağlandı (${c.state})`, orderRef);
      }
    }
    return { new: created };
  }

  private handled(caseId: number, text: string, close = false) {
    this.db
      .prepare(`UPDATE cases SET handled = ?, ${close ? "open = 0," : ""} updated_at = datetime('now') WHERE id = ?`)
      .run(text, caseId);
  }

  /** Automatic first response to a new case. */
  async autoHandle(c: CaseRow, order: OrderRow | undefined): Promise<void> {
    const s = this.e.settings();
    try {
      if (c.kind === "cancel" && s.autoApproveCancellations) {
        if (!order) return this.handled(c.id, "Sifariş sistemdə tapılmadı, əllə yoxla");
        const r = await this.approveCancel(c.id);
        if (r) this.handled(c.id, r);
      } else if (c.kind === "inquiry" && s.autoProvideTracking) {
        if (order?.tracking_number) {
          if (!this.e.ebay.dryRun) await this.postOrder.provideShipment(c.ebay_case_id, order.carrier ?? "Other", order.tracking_number);
          this.handled(c.id, `Tracking avtomatik göndərildi: ${order.carrier} ${order.tracking_number}`);
          activity(this.db, "inquiry", `"Item not received" halına tracking avtomatik verildi`, order.ebay_order_id);
        } else {
          this.handled(c.id, "Tracking hələ yoxdur. CJ statusunu yoxla, lazım olsa pulu qaytar");
        }
      }
    } catch (err) {
      this.handled(c.id, `Avtomatik cavab alınmadı: ${errMsg(err)}`);
      log(this.db, "error", "cases", `${c.kind} ${c.ebay_case_id}: ${errMsg(err)}`);
    }
  }

  /**
   * Approve a buyer's cancel request: cancels the CJ order first when one
   * exists and is not shipped. Returns a problem description or null.
   */
  async approveCancel(caseId: number): Promise<string | null> {
    const c = this.db.prepare("SELECT * FROM cases WHERE id = ?").get(caseId) as CaseRow | undefined;
    if (!c || c.kind !== "cancel") return "Ləğv sorğusu tapılmadı";
    const order = this.findOrder({ orderId: c.ebay_order_id ?? "", buyer: c.buyer ?? "" });
    if (order?.tracking_number || order?.status === "shipped") {
      return "Məhsul artıq göndərilib. Ləğvi təsdiqləmək olmur. Alıcıya mesaj yaz və ya return gözlə";
    }
    if (order?.supplier_order_id) {
      try {
        if (!this.e.ebay.dryRun) await this.e.supplier.cancelOrder(order.supplier_order_id);
        activity(this.db, "supplier", `CJ sifarişi ləğv edildi: ${order.supplier_order_id}`, order.ebay_order_id);
      } catch (err) {
        return `CJ sifarişini ləğv etmək alınmadı (${errMsg(err)}). Ödənilmiş sifarişi yalnız CJ dəstəyi ləğv edə bilər`;
      }
    }
    if (!this.e.ebay.dryRun) await this.postOrder.approveCancellation(c.ebay_case_id);
    if (order) this.db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(order.id);
    this.handled(c.id, "Ləğv təsdiqləndi, eBay pulu alıcıya qaytarır", true);
    activity(this.db, "cancel", `Ləğv sorğusu təsdiqləndi (${c.buyer})`, order?.ebay_order_id ?? c.ebay_order_id);
    return null;
  }

  async acceptReturn(caseId: number): Promise<void> {
    const c = this.db.prepare("SELECT * FROM cases WHERE id = ?").get(caseId) as CaseRow | undefined;
    if (!c || c.kind !== "return") throw new Error("return tapılmadı");
    if (!this.e.ebay.dryRun) await this.postOrder.acceptReturn(c.ebay_case_id);
    this.handled(c.id, "Return qəbul edildi. Məhsul geri gələndən sonra pulu qaytar");
    activity(this.db, "return", `Return qəbul edildi (${c.buyer})`, c.ebay_order_id);
  }

  /** Refund through the Fulfillment API (buyer keeps the item if it is a return). */
  async refund(orderId: number, amount: number, reason: string, caseId?: number): Promise<void> {
    const o = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as OrderRow | undefined;
    if (!o) throw new Error("sifariş tapılmadı");
    if (!(amount > 0) || amount > (o.total ?? 0) + 0.001) throw new Error(`məbləğ 0 ilə $${o.total} arasında olmalıdır`);
    await this.e.ebay.issueRefund(o.ebay_order_id, amount, reason, "Refund issued by seller");
    this.db.prepare("UPDATE orders SET refunded = COALESCE(refunded, 0) + ?, updated_at = datetime('now') WHERE id = ?").run(amount, orderId);
    if (caseId) this.handled(caseId, `$${amount.toFixed(2)} qaytarıldı`, true);
    activity(this.db, "refund", `Pul qaytarıldı: $${amount.toFixed(2)} (${reason})`, o.ebay_order_id);
  }

  // ======================= MONEY =======================

  async syncFinances(): Promise<{ tx: number; payouts: number }> {
    const txs = await this.finances.transactions(60);
    const up = this.db.prepare(
      `INSERT INTO finance_tx (tx_id, ebay_order_id, type, booking, amount, fees, tx_date) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tx_id) DO UPDATE SET amount = excluded.amount, fees = excluded.fees, type = excluded.type`,
    );
    for (const t of txs) up.run(t.txId, t.orderId, t.type, t.booking, t.amount, t.fees, t.date);
    // Real eBay fees per order
    this.db.exec(`UPDATE orders SET ebay_fees = (
      SELECT SUM(fees) FROM finance_tx f WHERE f.ebay_order_id = orders.ebay_order_id AND f.type = 'SALE'
    ) WHERE EXISTS (SELECT 1 FROM finance_tx f WHERE f.ebay_order_id = orders.ebay_order_id AND f.type = 'SALE')`);

    let newPayouts = 0;
    try {
      for (const p of await this.finances.payouts()) {
        const r = this.db
          .prepare("INSERT OR IGNORE INTO payouts (payout_id, status, amount, payout_date) VALUES (?, ?, ?, ?)")
          .run(p.payoutId, p.status, p.amount, p.date);
        this.db.prepare("UPDATE payouts SET status = ? WHERE payout_id = ?").run(p.status, p.payoutId);
        if (r.changes) {
          newPayouts++;
          activity(this.db, "payout", `eBay payout: $${p.amount.toFixed(2)} (${p.status})`);
        }
      }
    } catch (err) {
      log(this.db, "warn", "finance", `payouts: ${errMsg(err)}`);
    }
    await this.checkBalance();
    return { tx: txs.length, payouts: newPayouts };
  }

  cachedBalance(): { amount: number | null; at: number } {
    const r = this.db.prepare("SELECT value, expires_at FROM tokens WHERE name = 'cj_balance'").get() as { value: string; expires_at: number } | undefined;
    return r ? { amount: r.value === "" ? null : Number(r.value), at: r.expires_at } : { amount: null, at: 0 };
  }

  async checkBalance(): Promise<number | null> {
    let amount: number | null = null;
    try {
      amount = await this.e.supplier.getBalance();
    } catch (err) {
      log(this.db, "warn", "supplier", `balance: ${errMsg(err)}`);
      return this.cachedBalance().amount;
    }
    const prev = this.cachedBalance();
    this.db
      .prepare("INSERT INTO tokens (name, value, expires_at) VALUES ('cj_balance', ?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at")
      .run(amount === null ? "" : String(amount), Date.now());
    const limit = this.e.settings().lowBalanceAlert;
    if (amount !== null && amount < limit && (prev.amount === null || prev.amount >= limit)) {
      activity(this.db, "balance", `CJ balansı aşağıdır: $${amount.toFixed(2)}. Wallet-ə pul yüklə`);
      await this.e.notify(`CJ balansı aşağıdır: $${amount.toFixed(2)}. Avto-ödəniş dayana bilər, wallet-ə pul yüklə.`);
    }
    return amount;
  }

  // ======================= LISTING MANAGEMENT =======================

  private product(id: number): ProductRow {
    const p = this.db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | undefined;
    if (!p) throw new Error("məhsul tapılmadı");
    return p;
  }

  async editListing(id: number, input: { title?: string; price?: number; mode?: "lock" | "auto" }): Promise<void> {
    const p = this.product(id);
    const s = this.e.settings();
    const title = input.title?.trim().slice(0, 80) || p.ebay_title || p.title;
    const price = input.price && input.price > 0 ? Math.round(input.price * 100) / 100 : p.price;
    const live = !!p.ebay_offer_id && (p.status === "listed" || p.status === "paused");

    if (live && title !== p.ebay_title) {
      await this.e.ebay.upsertInventoryItem({
        sku: p.sku,
        title,
        description: p.ebay_description ?? "",
        aspects: p.ebay_aspects ? JSON.parse(p.ebay_aspects) : {},
        imageUrls: JSON.parse(p.images),
        quantity: p.status === "paused" ? 0 : Math.min(s.listingQuantity, p.stock),
      });
    }
    if (live && price !== p.price) {
      await this.e.ebay.updatePriceQuantity([
        { sku: p.sku, offerId: p.ebay_offer_id!, price, quantity: p.status === "paused" ? 0 : Math.min(s.listingQuantity, p.stock) },
      ]);
    }
    // A manual price change always locks the price, otherwise follow the chosen mode.
    const lock = price !== p.price || (input.mode ? input.mode === "lock" : !!p.price_locked);
    this.db
      .prepare("UPDATE products SET ebay_title = ?, price = ?, profit = ?, price_locked = ?, updated_at = datetime('now') WHERE id = ?")
      .run(title, price, profitAt(price, { cost: p.cost, shippingCost: p.shipping_cost }, s), lock ? 1 : 0, id);
    activity(this.db, "listing", `Elan redaktə edildi: "${title}", qiymət $${price}${lock ? " (sabit)" : ""}`, p.sku);
  }

  async pauseListing(id: number): Promise<void> {
    const p = this.product(id);
    if (p.ebay_offer_id) await this.e.ebay.updatePriceQuantity([{ sku: p.sku, offerId: p.ebay_offer_id, price: p.price, quantity: 0 }]);
    this.db.prepare("UPDATE products SET status = 'paused', paused_manual = 1, updated_at = datetime('now') WHERE id = ?").run(id);
    activity(this.db, "listing", `Elan dayandırıldı (say 0): ${p.ebay_title ?? p.title}`, p.sku);
  }

  async resumeListing(id: number): Promise<void> {
    const p = this.product(id);
    const qty = Math.min(this.e.settings().listingQuantity, p.stock);
    if (p.ebay_offer_id) await this.e.ebay.updatePriceQuantity([{ sku: p.sku, offerId: p.ebay_offer_id, price: p.price, quantity: qty }]);
    this.db.prepare("UPDATE products SET status = 'listed', paused_manual = 0, updated_at = datetime('now') WHERE id = ?").run(id);
    activity(this.db, "listing", `Elan yenidən aktivdir: ${p.ebay_title ?? p.title}`, p.sku);
  }
}

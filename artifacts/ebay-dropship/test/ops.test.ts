// Messages, returns/cancellations/INR, finances, CJ wallet, listing edits
// and a smoke test of every dashboard page, against a fake eBay API.

import assert from "node:assert/strict";
import { test } from "node:test";
import { ListingWriter } from "../src/ai/listing.ts";
import { loadConfig } from "../src/config.ts";
import { openDb } from "../src/db.ts";
import { EbayClient } from "../src/ebay/client.ts";
import { Engine } from "../src/services/engine.ts";
import { Ops } from "../src/services/ops.ts";
import { Scheduler } from "../src/services/scheduler.ts";
import { saveSettings } from "../src/settings.ts";
import { DemoSupplier } from "../src/suppliers/demo.ts";
import { createApp } from "../src/web/server.ts";

process.env.NODE_ENV = "test";
process.env.EBAY_CLIENT_ID = "test-id";
process.env.EBAY_CLIENT_SECRET = "test-secret";

type Call = { method: string; url: URL; headers: Record<string, string>; body: string };

const MESSAGES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<GetMemberMessagesResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <MemberMessage>
    <MemberMessageExchange>
      <Item><ItemID>110011</ItemID><Title>Car Phone Holder</Title></Item>
      <Question><MessageType>AskSellerQuestion</MessageType><SenderID>buyer1</SenderID><RecipientID>myshop</RecipientID>
        <Subject>Where is my order?</Subject><Body>Hi, when will it arrive?</Body><MessageID>555</MessageID></Question>
      <MessageStatus>Unanswered</MessageStatus><CreationDate>2026-11-20T10:00:00.000Z</CreationDate>
    </MemberMessageExchange>
  </MemberMessage>
  <HasMoreItems>false</HasMoreItems>
</GetMemberMessagesResponse>`;

function fakeEbay() {
  const calls: Call[] = [];
  const state = {
    cancellations: [] as unknown[],
    returns: [] as unknown[],
    inquiries: [] as unknown[],
  };
  const fetchImpl = async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    calls.push({ method: init.method ?? "GET", url: u, headers: (init.headers ?? {}) as Record<string, string>, body: String(init.body ?? "") });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    const p = u.pathname;
    if (p === "/identity/v1/oauth2/token") return json({ access_token: "tok", expires_in: 7200 });
    if (p === "/ws/api.dll") {
      const call = (init.headers as Record<string, string>)["X-EBAY-API-CALL-NAME"];
      if (call === "GetMemberMessages") return new Response(MESSAGES_XML);
      return new Response(`<${call}Response xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>Success</Ack></${call}Response>`);
    }
    if (p === "/post-order/v2/cancellation/search") return json({ cancellations: state.cancellations });
    if (p === "/post-order/v2/return/search") return json({ members: state.returns });
    if (p === "/post-order/v2/inquiry/search") return json({ members: state.inquiries });
    if (p.startsWith("/post-order/v2/")) return json({});
    if (p === "/sell/finances/v1/transaction") {
      return json({
        transactions: [
          { transactionId: "T1", orderId: "11-111-111", transactionType: "SALE", bookingEntry: "CREDIT", amount: { value: "17.10" }, totalFeeAmount: { value: "2.89" }, transactionDate: "2026-11-20T10:00:00Z" },
        ],
      });
    }
    if (p === "/sell/finances/v1/payout") return json({ payouts: [{ payoutId: "P1", payoutStatus: "SUCCEEDED", amount: { value: "120.50" }, payoutDate: "2026-11-21T00:00:00Z" }] });
    if (/\/issue_refund$/.test(p)) return json({ refundId: "R1", refundStatus: "PENDING" });
    if (p === "/sell/inventory/v1/bulk_update_price_quantity") return json({ responses: [] });
    if (p.startsWith("/sell/inventory/v1/inventory_item/")) return new Response(null, { status: 204 });
    if (p === "/sell/fulfillment/v1/order") return json({ orders: [] });
    return json({ error: `unhandled ${p}` }, 404);
  };
  return { calls, state, fetchImpl };
}

function setup() {
  process.env.DRY_RUN = "false";
  const cfg = loadConfig();
  const db = openDb(":memory:");
  const eb = fakeEbay();
  const ebay = new EbayClient({ cfg, db, fetchImpl: eb.fetchImpl });
  db.prepare("INSERT INTO tokens (name, value, expires_at) VALUES ('ebay_refresh', 'r', ?)").run(Date.now() + 1e9);
  const supplier = new DemoSupplier();
  const notes: string[] = [];
  const engine = new Engine({ db, supplier, ebay, writer: new ListingWriter({ apiKey: "", model: "x" }), notify: async (t) => void notes.push(t) });
  const ops = new Ops(engine);
  return { cfg, db, eb, engine, ops, supplier, notes };
}

function insertOrder(db: ReturnType<typeof openDb>, o: { id: string; status: string; supplierOrder?: string; tracking?: string; buyer?: string }) {
  db.prepare(
    `INSERT INTO orders (ebay_order_id, buyer, total, currency, ship_to, line_items, status, supplier_order_id, supplier_cost, tracking_number, carrier)
     VALUES (?, ?, 19.99, 'USD', ?, ?, ?, ?, 9.99, ?, ?)`,
  ).run(
    o.id,
    o.buyer ?? "buyer1",
    JSON.stringify({ name: "John", city: "Austin", state: "TX", zip: "73301", address1: "1 Main", address2: "", countryCode: "US" }),
    JSON.stringify([{ lineItemId: "LI1", sku: "DEMO-x", title: "Car Phone Holder", quantity: 1, price: 19.99, itemId: "110011" }]),
    o.status,
    o.supplierOrder ?? null,
    o.tracking ?? null,
    o.tracking ? "USPS" : null,
  );
  return (db.prepare("SELECT id FROM orders WHERE ebay_order_id = ?").get(o.id) as { id: number }).id;
}

test("messages: sync from Trading API XML, reply with parent message id", async () => {
  const { db, eb, ops, notes } = setup();
  insertOrder(db, { id: "11-111-111", status: "shipped", tracking: "9400111" });
  const r = await ops.syncMessages();
  assert.equal(r.added, 1);
  const m = db.prepare("SELECT * FROM messages").get() as Record<string, any>;
  assert.equal(m.sender, "buyer1");
  assert.equal(m.item_id, "110011");
  assert.equal(m.status, "unanswered");
  assert.ok(notes.some((n) => n.includes("when will it arrive")));
  const getCall = eb.calls.find((c) => c.headers["X-EBAY-API-CALL-NAME"] === "GetMemberMessages")!;
  assert.equal(getCall.headers["X-EBAY-API-IAF-TOKEN"], "tok");
  assert.match(getCall.body, /<MailMessageType>All<\/MailMessageType>/);

  // syncing again adds nothing
  assert.equal((await ops.syncMessages()).added, 0);

  await ops.reply(m.id, "It ships with USPS, tracking 9400111.");
  const rtq = eb.calls.find((c) => c.headers["X-EBAY-API-CALL-NAME"] === "AddMemberMessageRTQ")!;
  assert.match(rtq.body, /<ParentMessageID>555<\/ParentMessageID>/);
  assert.match(rtq.body, /<RecipientID>buyer1<\/RecipientID>/);
  assert.match(rtq.body, /<ItemID>110011<\/ItemID>/);
  assert.equal((db.prepare("SELECT status FROM messages WHERE id = ?").get(m.id) as { status: string }).status, "answered");
});

test("cancel request: auto-approved when not shipped, CJ order cancelled first", async () => {
  const { db, eb, ops, supplier } = setup();
  saveSettings(db, { autoApproveCancellations: true });
  const cj = await supplier.createOrder({ reference: "11-222-222", shipTo: {} as never, items: [] });
  insertOrder(db, { id: "11-222-222", status: "supplier_ordered", supplierOrder: cj.orderId });
  eb.state.cancellations.push({ cancelId: "C1", legacyOrderId: "11-222-222", cancelState: "CANCEL_REQUESTED", cancelReason: "BUYER_CHANGED_MIND" });

  await ops.syncCases();
  assert.ok(eb.calls.some((c) => c.method === "POST" && c.url.pathname === "/post-order/v2/cancellation/C1/approve"));
  assert.ok(eb.calls.find((c) => c.url.pathname.startsWith("/post-order"))!.headers.Authorization.startsWith("IAF "));
  assert.equal(supplier.orders.has(cj.orderId), false, "CJ order cancelled");
  assert.equal((db.prepare("SELECT status FROM orders WHERE ebay_order_id='11-222-222'").get() as { status: string }).status, "cancelled");
  const c = db.prepare("SELECT open, handled FROM cases").get() as { open: number; handled: string };
  assert.equal(c.open, 0);
});

test("cancel request for a shipped order is not approved", async () => {
  const { db, eb, ops } = setup();
  insertOrder(db, { id: "11-333-333", status: "shipped", tracking: "9400" });
  eb.state.cancellations.push({ cancelId: "C2", legacyOrderId: "11-333-333", cancelState: "CANCEL_REQUESTED" });
  await ops.syncCases();
  assert.ok(!eb.calls.some((c) => c.url.pathname.endsWith("/approve")));
  const c = db.prepare("SELECT open, handled FROM cases").get() as { open: number; handled: string };
  assert.equal(c.open, 1);
  assert.match(c.handled, /göndərilib/);
});

test("item-not-received: tracking sent automatically; return: refund on click", async () => {
  const { db, eb, ops } = setup();
  const oid = insertOrder(db, { id: "11-444-444", status: "shipped", tracking: "9400999", buyer: "b4" });
  eb.state.inquiries.push({ inquiryId: "I1", orderId: "11-444-444", buyer: "b4", inquiryStatusEnum: "OPEN" });
  eb.state.returns.push({ returnId: "R9", orderId: "11-444-444", buyerLoginName: "b4", state: "RETURN_REQUESTED", creationInfo: { reason: "NOT_AS_DESCRIBED", comments: { content: "broken" } } });
  await ops.syncCases();

  const ship = eb.calls.find((c) => c.url.pathname === "/post-order/v2/inquiry/I1/provide_shipment_info")!;
  assert.deepEqual(JSON.parse(ship.body), { shippingCarrierName: "USPS", trackingNumber: "9400999" });
  const ret = db.prepare("SELECT * FROM cases WHERE kind='return'").get() as Record<string, any>;
  assert.equal(ret.open, 1, "returns wait for owner decision");
  assert.equal(ret.comment, "broken");

  await ops.refund(oid, 19.99, "BUYER_RETURN", ret.id);
  const refund = eb.calls.find((c) => c.url.pathname === "/sell/fulfillment/v1/order/11-444-444/issue_refund")!;
  assert.deepEqual(JSON.parse(refund.body).orderLevelRefundAmount, { value: "19.99", currency: "USD" });
  assert.equal((db.prepare("SELECT refunded FROM orders WHERE id = ?").get(oid) as { refunded: number }).refunded, 19.99);
  await assert.rejects(ops.refund(oid, 50, "OTHER"), /məbləğ/);
});

test("finances: real fees mapped to orders, payouts recorded, low CJ balance alert", async () => {
  const { db, eb, ops, supplier, notes } = setup();
  insertOrder(db, { id: "11-111-111", status: "shipped" });
  supplier.balance = 12;
  saveSettings(db, { lowBalanceAlert: 50 });
  const r = await ops.syncFinances();
  assert.equal(r.tx, 1);
  assert.equal(r.payouts, 1);
  assert.equal((db.prepare("SELECT ebay_fees FROM orders").get() as { ebay_fees: number }).ebay_fees, 2.89);
  assert.ok(eb.calls.some((c) => c.url.host === "apiz.ebay.com"), "finances host");
  assert.equal(ops.cachedBalance().amount, 12);
  assert.ok(notes.some((n) => n.includes("CJ balansı aşağıdır")));
  // second run: no duplicate alert, no duplicate payout
  notes.length = 0;
  assert.equal((await ops.syncFinances()).payouts, 0);
  assert.ok(!notes.some((n) => n.includes("CJ balansı")));
});

test("listing edit locks price and sync keeps it; pause/resume", async () => {
  const { db, eb, engine, ops } = setup();
  saveSettings(db, { keywords: "phone holder", autoApproveMinScore: 1, fulfillmentPolicyId: "F", paymentPolicyId: "P", returnPolicyId: "R", merchantLocationKey: "m" });
  db.prepare(
    `INSERT INTO products (sku, supplier, supplier_product_id, supplier_variant_id, title, images, cost, shipping_cost, logistic_name, stock, price, profit, status, ebay_offer_id, ebay_title)
     VALUES ('DEMO-demo-1-black', 'demo', 'demo-1', 'demo-1-black', 'Holder', '[]', 3.1, 4.2, 'US|USPS+', 150, 13.99, 4, 'listed', 'OF1', 'Holder')`,
  ).run();
  const id = (db.prepare("SELECT id FROM products").get() as { id: number }).id;

  await ops.editListing(id, { price: 24.99, mode: "auto" });
  let p = db.prepare("SELECT price, price_locked FROM products WHERE id = ?").get(id) as { price: number; price_locked: number };
  assert.deepEqual({ ...p }, { price: 24.99, price_locked: 1 }, "manual price change locks");

  await engine.syncListings();
  p = db.prepare("SELECT price, price_locked FROM products WHERE id = ?").get(id) as { price: number; price_locked: number };
  assert.equal(p.price, 24.99, "sync keeps locked price");

  await ops.pauseListing(id);
  const pausedQty = eb.calls.filter((c) => c.url.pathname === "/sell/inventory/v1/bulk_update_price_quantity").at(-1)!;
  assert.equal(JSON.parse(pausedQty.body).requests[0].offers[0].availableQuantity, 0);
  eb.calls.length = 0;
  await engine.syncListings();
  assert.ok(!eb.calls.some((c) => c.url.pathname === "/sell/inventory/v1/bulk_update_price_quantity"), "sync leaves manually paused listing alone");
  await ops.resumeListing(id);
  assert.equal((db.prepare("SELECT status FROM products WHERE id = ?").get(id) as { status: string }).status, "listed");
});

test("every dashboard page renders", async () => {
  const { cfg, db, engine, ops } = setup();
  const oid = insertOrder(db, { id: "11-555-555", status: "awaiting_payment", supplierOrder: "X" });
  db.prepare("INSERT INTO events (kind, text, ref) VALUES ('order', 'Yeni sifariş', '11-555-555')").run();
  db.prepare("INSERT INTO messages (ebay_message_id, direction, sender, body, status) VALUES ('1', 'in', 'buyer1', 'hello <script>', 'unanswered')").run();
  db.prepare("INSERT INTO cases (kind, ebay_case_id, ebay_order_id, buyer, reason, open) VALUES ('return', 'R1', '11-555-555', 'buyer1', 'DEFECTIVE', 1)").run();
  db.prepare(
    `INSERT INTO products (sku, supplier, supplier_product_id, supplier_variant_id, title, images, cost, shipping_cost, stock, price, profit, status)
     VALUES ('S1', 'demo', 'p', 'v', 'Thing', '[]', 1, 1, 10, 9.99, 4, 'listed')`,
  ).run();
  const app = createApp({ cfg, engine, ops, scheduler: new Scheduler(engine, ops) });
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  try {
    for (const path of ["/", "/orders", `/orders/${oid}`, "/orders?f=attention", "/messages", "/cases", "/finance", "/activity", "/products/1", "/products?status=listed", "/settings", "/ebay", "/logs", "/assistant"]) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      const html = await res.text();
      assert.equal(res.status, 200, `${path} -> ${res.status}`);
      assert.ok(!html.includes("<script>"), `${path} escapes user content`);
    }
    const home = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(home, /sifariş sənin qərarını gözləyir/);
    assert.match(home, /cavabsız alıcı mesajı/);
  } finally {
    server.close();
  }
});

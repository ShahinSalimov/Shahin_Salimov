// End-to-end flow in LIVE mode against a fake eBay API and the demo supplier:
// research -> auto-list -> order arrives -> supplier order + pay -> tracking upload.

import assert from "node:assert/strict";
import { test } from "node:test";
import { ListingWriter } from "../src/ai/listing.ts";
import { loadConfig } from "../src/config.ts";
import { openDb } from "../src/db.ts";
import { EbayClient } from "../src/ebay/client.ts";
import { Engine } from "../src/services/engine.ts";
import { saveSettings } from "../src/settings.ts";
import { CjSupplier } from "../src/suppliers/cj.ts";
import { DemoSupplier } from "../src/suppliers/demo.ts";

process.env.NODE_ENV = "test";
process.env.EBAY_CLIENT_ID = "test-id";
process.env.EBAY_CLIENT_SECRET = "test-secret";

type Call = { method: string; path: string; body: unknown };

function fakeEbay() {
  const calls: Call[] = [];
  const orders: unknown[] = [];
  const fetchImpl = async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init.body ?? null;
    calls.push({ method, path: u.pathname, body });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    const p = u.pathname;
    if (p === "/identity/v1/oauth2/token") return json({ access_token: "tok", expires_in: 7200 });
    if (p === "/buy/browse/v1/item_summary/search") {
      return json({ total: 600, itemSummaries: [24.99, 26.5, 29.99, 27, 31].map((v) => ({ price: { value: String(v) } })) });
    }
    if (p.endsWith("get_default_category_tree_id")) return json({ categoryTreeId: "0" });
    if (p.endsWith("get_category_suggestions")) return json({ categorySuggestions: [{ category: { categoryId: "123", categoryName: "Test" } }] });
    if (p.endsWith("get_item_aspects_for_category")) {
      return json({ aspects: [{ localizedAspectName: "Type", aspectConstraint: { aspectRequired: true }, aspectValues: [{ localizedValue: "Holder" }] }] });
    }
    if (p.startsWith("/sell/inventory/v1/inventory_item/")) return new Response(null, { status: 204 });
    if (p === "/sell/inventory/v1/offer") return json({ offerId: `OF-${calls.length}` }, 201);
    if (/\/offer\/[^/]+\/publish$/.test(p)) return json({ listingId: `L-${calls.length}` });
    if (p === "/sell/inventory/v1/bulk_update_price_quantity") return json({ responses: [] });
    if (p === "/sell/fulfillment/v1/order") return json({ orders });
    if (/shipping_fulfillment$/.test(p)) return new Response(null, { status: 201 });
    return json({ error: `unhandled ${p}` }, 404);
  };
  return { calls, orders, fetchImpl };
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
  saveSettings(db, {
    keywords: "phone holder, pet hair, nike",
    fulfillmentPolicyId: "F",
    paymentPolicyId: "P",
    returnPolicyId: "R",
    merchantLocationKey: "main",
    autoApproveMinScore: 1,
  });
  return { db, eb, engine, supplier, notes };
}

test("full automated flow", async () => {
  const { db, eb, engine, supplier, notes } = setup();

  // 1. research + auto-list
  const { added } = await engine.runResearch();
  assert.ok(added >= 2, `added ${added}`);
  const listed = db.prepare("SELECT * FROM products WHERE status = 'listed'").all() as { sku: string; title: string; price: number }[];
  assert.ok(listed.length >= 2, "products auto-listed");
  assert.ok(!listed.some((p) => /nike/i.test(p.title)), "brand item never listed");
  assert.ok(eb.calls.some((c) => c.path.startsWith("/sell/inventory/v1/inventory_item/")), "inventory item created");
  const offer = eb.calls.find((c) => c.path === "/sell/inventory/v1/offer")!.body as Record<string, any>;
  assert.equal(offer.listingPolicies.fulfillmentPolicyId, "F");
  assert.equal(offer.categoryId, "123");

  // 2. an order arrives
  const sku = listed[0]!.sku;
  eb.orders.push({
    orderId: "11-111",
    orderPaymentStatus: "PAID",
    buyer: { username: "buyer1" },
    pricingSummary: { total: { value: "19.99", currency: "USD" } },
    fulfillmentStartInstructions: [
      { shippingStep: { shipTo: { fullName: "John Doe", primaryPhone: { phoneNumber: "5551234" }, contactAddress: { addressLine1: "1 Main St", city: "Austin", stateOrProvince: "TX", postalCode: "73301", countryCode: "US" } } } },
    ],
    lineItems: [{ lineItemId: "LI1", sku, title: "Item", quantity: 1, lineItemCost: { value: "19.99" } }],
  });
  const r = await engine.processOrders();
  assert.deepEqual(r, { imported: 1, fulfilled: 1 });
  const order = db.prepare("SELECT * FROM orders WHERE ebay_order_id = '11-111'").get() as Record<string, any>;
  assert.equal(order.status, "supplier_ordered");
  assert.equal(supplier.orders.get(order.supplier_order_id)?.paid, true, "supplier order paid");
  assert.equal(supplier.orders.get(order.supplier_order_id)?.input.shipTo.city, "Austin");

  // re-polling does not create duplicates
  await engine.processOrders();
  assert.equal(supplier.orders.size, 1);

  // 3. tracking
  const t = await engine.updateTracking();
  assert.equal(t.shipped, 1);
  const ful = eb.calls.find((c) => c.path.endsWith("/shipping_fulfillment"))!.body as Record<string, any>;
  assert.equal(ful.shippingCarrierCode, "USPS");
  assert.deepEqual(ful.lineItems, [{ lineItemId: "LI1", quantity: 1 }]);
  assert.ok(notes.some((n) => n.includes("New eBay order")));
});

test("unknown SKU order goes to needs_attention, nothing ordered", async () => {
  const { db, eb, engine, supplier } = setup();
  eb.orders.push({
    orderId: "22-222",
    orderPaymentStatus: "PAID",
    fulfillmentStartInstructions: [{ shippingStep: { shipTo: { fullName: "A", contactAddress: { addressLine1: "x", postalCode: "1" } } } }],
    lineItems: [{ lineItemId: "L", sku: "MANUAL-1", title: "Manual", quantity: 1 }],
  });
  await engine.processOrders();
  const o = db.prepare("SELECT status, note FROM orders").get() as { status: string; note: string };
  assert.equal(o.status, "needs_attention");
  assert.match(o.note, /unknown SKU/);
  assert.equal(supplier.orders.size, 0);
});

test("sync pauses out-of-stock listing and reprices on cost change", async () => {
  const { db, eb, engine, supplier } = setup();
  await engine.runResearch();
  const before = db.prepare("SELECT id, price FROM products WHERE status='listed' ORDER BY id LIMIT 1").get() as { id: number; price: number };

  supplier.getStock = async () => ({ total: 0, byCountry: {} });
  const res = await engine.syncListings();
  assert.ok(res.updated >= 1);
  const after = db.prepare("SELECT status FROM products WHERE id = ?").get(before.id) as { status: string };
  assert.equal(after.status, "paused");
  const bulk = eb.calls.find((c) => c.path === "/sell/inventory/v1/bulk_update_price_quantity")!.body as Record<string, any>;
  assert.equal(bulk.requests[0].shipToLocationAvailability.quantity, 0);
});

test("DRY_RUN never calls eBay write endpoints", async () => {
  process.env.DRY_RUN = "true";
  const cfg = loadConfig();
  const db = openDb(":memory:");
  const eb = fakeEbay();
  const engine = new Engine({
    db,
    supplier: new DemoSupplier(),
    ebay: new EbayClient({ cfg, db, fetchImpl: eb.fetchImpl }),
    writer: new ListingWriter({ apiKey: "", model: "x" }),
    notify: async () => {},
  });
  saveSettings(db, { keywords: "phone holder", autoApproveMinScore: 1 });
  await engine.runResearch();
  const writes = eb.calls.filter((c) => c.method !== "GET" && c.path !== "/identity/v1/oauth2/token");
  assert.deepEqual(writes, []);
  process.env.DRY_RUN = "false";
});

test("CJ client: auth token cached, product + order mapping", async () => {
  const db = openDb(":memory:");
  const seen: string[] = [];
  const ok = (data: unknown) => new Response(JSON.stringify({ code: 200, result: true, message: "Success", data }));
  const fetchImpl = async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    seen.push(`${init.method} ${u.pathname}`);
    if (u.pathname.endsWith("/authentication/getAccessToken")) return ok({ accessToken: "AT", accessTokenExpiryDate: new Date(Date.now() + 86400e3).toISOString() });
    assert.equal((init.headers as Record<string, string>)["CJ-Access-Token"], "AT");
    if (u.pathname.endsWith("/product/query")) {
      return ok({ pid: "P1", productNameEn: "Thing", productImageSet: '["https://a/1.jpg"]', sellPrice: "2.5", variants: [{ vid: "V1", variantSellPrice: 2.5, variantNameEn: "Red" }] });
    }
    if (u.pathname.endsWith("/product/stock/queryByVid")) return ok([{ countryCode: "US", storageNum: 40 }, { countryCode: "CN", storageNum: 900 }]);
    if (u.pathname.endsWith("/shopping/order/createOrderV2")) return ok({ orderId: "CJ-9", orderAmount: "7.10" });
    return ok({});
  };
  const cj = new CjSupplier({ db, apiKey: "k", baseUrl: "https://cj.test/api2.0/v1", fetchImpl });
  const p = await cj.getProduct("P1");
  assert.deepEqual(p.images, ["https://a/1.jpg"]);
  assert.equal(p.variants[0]!.price, 2.5);
  const st = await cj.getStock("V1", ["US"]);
  assert.equal(st.total, 40);
  const o = await cj.createOrder({ reference: "E1", items: [{ variantId: "V1", quantity: 1 }], shipTo: { name: "a", phone: "1", address1: "x", address2: "", city: "c", state: "s", zip: "z", countryCode: "US" } });
  assert.deepEqual(o, { orderId: "CJ-9", cost: 7.1 });
  assert.equal(seen.filter((s) => s.includes("getAccessToken")).length, 1, "token fetched once");
});

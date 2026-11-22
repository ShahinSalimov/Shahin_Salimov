import assert from "node:assert/strict";
import { test } from "node:test";
import { renderDescription, templateListing, truncateTitle } from "../src/ai/listing.ts";
import { mapCarrier } from "../src/ebay/client.ts";
import { checkProductSafety } from "../src/filters.ts";
import { charmPrice, computePrice, profitAt } from "../src/pricing.ts";
import { median, scoreCandidate } from "../src/research.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import { parseAging, parseCjPrice } from "../src/suppliers/cj.ts";

const S = DEFAULT_SETTINGS;

test("charmPrice rounds up to .99", () => {
  assert.equal(charmPrice(12.3), 12.99);
  assert.equal(charmPrice(12.99), 12.99);
  assert.equal(charmPrice(12.995), 13.99);
});

test("computePrice hits margin and never goes below min profit", () => {
  const r = computePrice({ cost: 5, shippingCost: 4 }, S);
  assert.ok(r.profit >= S.minProfit, `profit ${r.profit}`);
  assert.ok(r.marginPercent >= S.marginPercent - 0.01, `margin ${r.marginPercent}`);
  assert.equal(r.profit, profitAt(r.price, { cost: 5, shippingCost: 4 }, S));

  const cheap = computePrice({ cost: 0.5, shippingCost: 0.5 }, S);
  assert.ok(cheap.profit >= S.minProfit, "min profit wins on cheap items");
});

test("computePrice rejects impossible fee/margin settings", () => {
  assert.throws(() => computePrice({ cost: 1, shippingCost: 1 }, { ...S, marginPercent: 90 }));
});

test("safety filter blocks brands and restricted items, allows generic", () => {
  assert.equal(checkProductSafety("Magnetic Car Phone Holder").ok, true);
  assert.equal(checkProductSafety("Case for iPhone 15").ok, false);
  assert.equal(checkProductSafety("Tactical Folding Knife").ok, false);
  // word boundary: "applesauce" is not "apple"
  assert.equal(checkProductSafety("Applesauce maker tool").ok, true);
});

test("median", () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test("scoreCandidate rejects overpriced and rewards profitable products", () => {
  const market = { total: 800, prices: [20, 22, 25, 24, 21] };
  const over = scoreCandidate({ price: 30, profit: 8, stock: 500, shippingDays: 7, market }, S);
  assert.match(over.reject ?? "", /above market median/);

  const good = scoreCandidate({ price: 18.99, profit: 6, stock: 500, shippingDays: 6, market }, S);
  assert.equal(good.reject, null);
  assert.ok(good.score >= 60, `score ${good.score}`);

  const slow = scoreCandidate({ price: 18.99, profit: 6, stock: 500, shippingDays: 25, market }, S);
  assert.match(slow.reject ?? "", /shipping/);
});

test("CJ parsers", () => {
  assert.equal(parseCjPrice("3.20 -- 5.10"), 3.2);
  assert.equal(parseCjPrice(7), 7);
  assert.equal(parseCjPrice(undefined), 0);
  assert.equal(parseAging("7-12"), 12);
  assert.equal(parseAging(""), null);
});

test("carrier mapping", () => {
  assert.equal(mapCarrier("CJPacket", "9400111899223817562130"), "USPS");
  assert.equal(mapCarrier(null, "1Z999AA10123456784"), "UPS");
  assert.equal(mapCarrier("YunExpress", "YT2312345678"), "YunExpress");
  assert.equal(mapCarrier("Unknown Line", "ABC"), "Other");
});

test("listing helpers", () => {
  const t = truncateTitle("word ".repeat(40));
  assert.ok(t.length <= 80);
  const html = renderDescription({ paragraph: "<b>x</b>", bullets: ["a"], specs: [], handlingDays: 3 });
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"), "escapes html");
  const d = templateListing({
    supplierTitle: "Pet Hair Roller",
    supplierDescription: "<p>Great <img src=x> roller</p>",
    variantName: "Blue",
    categoryName: null,
    aspects: [{ name: "Type", required: true, values: ["Lint Roller"] }],
    handlingDays: 3,
    shippingDays: 7,
  });
  assert.equal(d.aspects.Brand?.[0], "Unbranded");
  assert.equal(d.aspects.Type?.[0], "Lint Roller");
  assert.ok(!d.description.includes("<img"));
});

// Fake supplier for trying the whole flow without a CJ account (DEMO_SUPPLIER=true)
// and for tests. Deterministic data.

import type { Supplier, SupplierOrderInput, SupplierProduct } from "./types.ts";

const CATALOG: SupplierProduct[] = [
  {
    productId: "demo-1",
    title: "Magnetic Car Phone Holder 360 Rotation Dashboard Mount",
    description: "Strong N52 magnets, 360 degree rotation, fits all phones 4-7 inch.",
    images: ["https://placehold.co/800x800/png?text=Phone+Holder"],
    price: 3.1,
    variants: [{ variantId: "demo-1-black", sku: "D1-BLK", name: "Black", price: 3.1 }],
  },
  {
    productId: "demo-2",
    title: "Reusable Pet Hair Remover Roller for Couch and Carpet",
    description: "Self-cleaning lint roller, no sticky tape needed, works on furniture and bedding.",
    images: ["https://placehold.co/800x800/png?text=Pet+Hair+Roller"],
    price: 4.5,
    variants: [{ variantId: "demo-2-blue", sku: "D2-BLU", name: "Blue", price: 4.5 }],
  },
  {
    productId: "demo-3",
    title: "LED Strip Lights 16.4ft RGB Color Changing with Remote",
    description: "5050 RGB LEDs, 44-key remote, cuttable, adhesive backing.",
    images: ["https://placehold.co/800x800/png?text=LED+Strip"],
    price: 6.2,
    variants: [{ variantId: "demo-3-5m", sku: "D3-5M", name: "16.4ft", price: 6.2 }],
  },
  {
    productId: "demo-4",
    title: "Nike Style Running Shoes", // blocked by brand filter
    description: "Sport shoes",
    images: [],
    price: 9,
    variants: [{ variantId: "demo-4-42", sku: "D4-42", name: "42", price: 9 }],
  },
];

export class DemoSupplier implements Supplier {
  readonly name = "demo";
  orders = new Map<string, { input: SupplierOrderInput; paid: boolean; polls: number }>();
  private seq = 0;

  async search(keyword: string, limit: number) {
    const words = keyword.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = CATALOG.filter((p) => words.some((w) => p.title.toLowerCase().includes(w)));
    return (hits.length ? hits : CATALOG).slice(0, limit).map((p) => ({ productId: p.productId, title: p.title, price: p.price }));
  }

  async getProduct(productId: string) {
    const p = CATALOG.find((c) => c.productId === productId);
    if (!p) throw new Error(`demo product ${productId} not found`);
    return structuredClone(p);
  }

  async getStock(_variantId: string, countries: string[]) {
    const byCountry: Record<string, number> = { US: 150, CN: 2000 };
    return { total: countries.reduce((s, c) => s + (byCountry[c] ?? 0), 0), byCountry };
  }

  async quoteShipping(_variantId: string, fromCountry: string) {
    return fromCountry === "US"
      ? { logisticName: "USPS+", price: 4.2, days: 6, fromCountry }
      : { logisticName: "CJPacket Ordinary", price: 3.5, days: 12, fromCountry };
  }

  async createOrder(input: SupplierOrderInput) {
    const orderId = `DEMO-${++this.seq}`;
    this.orders.set(orderId, { input, paid: false, polls: 0 });
    return { orderId, cost: 9.99 };
  }

  async payOrder(orderId: string) {
    const o = this.orders.get(orderId);
    if (o) o.paid = true;
  }

  balance = 250;

  async getBalance() {
    return this.balance;
  }

  async cancelOrder(orderId: string) {
    this.orders.delete(orderId);
  }

  async getOrder(orderId: string) {
    const o = this.orders.get(orderId);
    if (!o) return { status: "UNKNOWN", trackingNumber: null, carrier: null, cancelled: false };
    o.polls++;
    const shipped = o.paid && o.polls >= 1;
    return {
      status: shipped ? "SHIPPED" : o.paid ? "UNSHIPPED" : "UNPAID",
      trackingNumber: shipped ? `9400100000000000${orderId.replace(/\D/g, "").padStart(6, "0")}` : null,
      carrier: shipped ? "USPS" : null,
      cancelled: false,
    };
  }
}

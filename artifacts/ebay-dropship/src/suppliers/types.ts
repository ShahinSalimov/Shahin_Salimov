export type SupplierVariant = {
  variantId: string;
  sku: string;
  name: string;
  price: number; // our cost, USD
  image?: string;
  weightGrams?: number;
};

export type SupplierProduct = {
  productId: string;
  title: string;
  description: string;
  images: string[];
  price: number;
  variants: SupplierVariant[];
};

export type ShippingQuote = {
  logisticName: string;
  price: number;
  days: number | null; // upper bound of delivery estimate
  fromCountry: string;
};

export type ShipTo = {
  name: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  countryCode: string;
};

export type SupplierOrderInput = {
  reference: string; // our eBay order id
  shipTo: ShipTo;
  items: { variantId: string; quantity: number }[];
  logisticName?: string;
  fromCountry?: string;
};

export type SupplierOrderStatus = {
  status: string;
  trackingNumber: string | null;
  carrier: string | null;
  cancelled: boolean;
};

export interface Supplier {
  readonly name: string;
  search(keyword: string, limit: number): Promise<{ productId: string; title: string; price: number }[]>;
  getProduct(productId: string): Promise<SupplierProduct>;
  /** Stock available to ship, summed over warehouses in the given countries. */
  getStock(variantId: string, countries: string[]): Promise<{ total: number; byCountry: Record<string, number> }>;
  /** Cheapest shipping quote to the US from the first country in the list that has stock. */
  quoteShipping(variantId: string, fromCountry: string, toCountry: string): Promise<ShippingQuote | null>;
  createOrder(input: SupplierOrderInput): Promise<{ orderId: string; cost: number | null }>;
  payOrder(orderId: string): Promise<void>;
  getOrder(orderId: string): Promise<SupplierOrderStatus>;
}

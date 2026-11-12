import { cleanInline } from "./sanitize";
import { makeFact, type FactDraft } from "./fact";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };

const MAX_NODES = 2000;

function isObj(v: Json | undefined): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function types(node: Obj): string[] {
  const t = node["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string").map((x) => x.replace(/^https?:\/\/schema\.org\//, ""));
}

function text(v: Json | undefined): string | null {
  if (typeof v === "string") return cleanInline(v, 500) || null;
  if (typeof v === "number") return String(v);
  if (isObj(v) && typeof v.name === "string") return cleanInline(v.name, 300);
  return null;
}

function stripSchema(v: string): string {
  return v.replace(/^https?:\/\/schema\.org\//, "");
}

const PRODUCT_TYPES = new Set(["Product", "MenuItem", "Service", "IndividualProduct", "ProductModel"]);
const BUSINESS_HINT = /(Business|Restaurant|Store|Organization|Establishment|Cafe|Bakery|Bar|Hotel|Shop|Place|Office|Clinic)$/;

/** Walks parsed JSON-LD blocks and extracts schema.org products, menu items and businesses. */
export function factsFromJsonLd(blocks: Json[]): FactDraft[] {
  const facts: FactDraft[] = [];
  let visited = 0;
  const add = (entity: string, attr: string, value: string | null, path: string) => {
    if (!value) return;
    const f = makeFact(entity, attr, value, { kind: "json_ld", path }, 0.95, "json_ld");
    if (f) facts.push(f);
  };

  const offerFacts = (entity: string, offers: Json | undefined, path: string) => {
    const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
    list.slice(0, 5).forEach((o, i) => {
      if (!isObj(o)) return;
      const p = `${path}.offers${list.length > 1 ? `[${i}]` : ""}`;
      const price = o.price ?? o.lowPrice ?? (isObj(o.priceSpecification) ? o.priceSpecification.price : undefined);
      const currency = typeof o.priceCurrency === "string" ? o.priceCurrency : isObj(o.priceSpecification) && typeof o.priceSpecification.priceCurrency === "string" ? o.priceSpecification.priceCurrency : "";
      if (price !== undefined && price !== null && price !== "") add(entity, "price", `${currency ? `${currency} ` : ""}${String(price)}`.trim(), `${p}.price`);
      if (typeof o.availability === "string") add(entity, "availability", stripSchema(o.availability), `${p}.availability`);
    });
  };

  const visit = (node: Json, path: string) => {
    if (visited++ > MAX_NODES) return;
    if (Array.isArray(node)) {
      node.forEach((n, i) => visit(n, `${path}[${i}]`));
      return;
    }
    if (!isObj(node)) return;
    const t = types(node);
    const name = text(node.name);

    if (name && t.some((x) => PRODUCT_TYPES.has(x))) {
      offerFacts(name, node.offers, path);
      add(name, "sku", text(node.sku), `${path}.sku`);
      add(name, "brand", text(node.brand), `${path}.brand`);
    }
    if (name && t.includes("Offer") && isObj(node.itemOffered)) {
      const item = text(node.itemOffered.name) ?? name;
      offerFacts(item, node, path);
    }
    const looksLikeBusiness = t.some((x) => BUSINESS_HINT.test(x)) || (name && (node.telephone || node.address || node.openingHours));
    if (name && looksLikeBusiness) {
      add(name, "phone", text(node.telephone), `${path}.telephone`);
      add(name, "email", text(node.email), `${path}.email`);
      const addr = node.address;
      if (typeof addr === "string") add(name, "address", addr, `${path}.address`);
      else if (isObj(addr)) {
        const parts = [addr.streetAddress, addr.addressLocality, addr.postalCode, addr.addressCountry].map((p) => text(p)).filter(Boolean);
        if (parts.length) add(name, "address", parts.join(", "), `${path}.address`);
      }
      const oh = node.openingHours;
      if (typeof oh === "string") add(name, "opening hours", oh, `${path}.openingHours`);
      else if (Array.isArray(oh)) add(name, "opening hours", oh.filter((x): x is string => typeof x === "string").join("; "), `${path}.openingHours`);
      const spec = Array.isArray(node.openingHoursSpecification) ? node.openingHoursSpecification : node.openingHoursSpecification ? [node.openingHoursSpecification] : [];
      spec.slice(0, 14).forEach((s, i) => {
        if (!isObj(s)) return;
        const days = (Array.isArray(s.dayOfWeek) ? s.dayOfWeek : [s.dayOfWeek]).filter((d): d is string => typeof d === "string").map(stripSchema);
        if (days.length && typeof s.opens === "string" && typeof s.closes === "string") {
          add(name, "opening hours", `${days.join(", ")} ${s.opens}-${s.closes}`, `${path}.openingHoursSpecification[${i}]`);
        }
      });
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === "@context") continue;
      if (typeof v === "object" && v !== null) visit(v, `${path}.${k}`);
    }
  };

  blocks.forEach((b, i) => visit(b, `ld[${i}]`));
  return facts;
}

export function parseJsonLd(raw: string): { ok: true; value: Json } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) as Json };
  } catch {
    return { ok: false };
  }
}

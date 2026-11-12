import { normalizeText } from "../extraction/normalize";

/** Page-level descriptors are about the document itself, not about the business. */
export const PAGE_LEVEL_ATTRIBUTES = new Set(["page title", "meta description", "main heading"]);

/** Attributes that identify a business regardless of how the entity is named. */
export const IDENTIFIER_ATTRIBUTES = new Set(["phone", "email", "address"]);

const ATTRIBUTE_SYNONYMS: [RegExp, string][] = [
  [/^(price|cost|amount|fee|unit price|retail price|qiymət|fiyat)$/, "price"],
  [/^(phone|telephone|tel|phone number|mobile|telefon)$/, "phone"],
  [/^(e-?mail|email address|e-?poçt|e-?posta)$/, "email"],
  [/^(opening hours|hours|open|opening times|business hours|iş saatları|çalışma saatleri)$/, "opening hours"],
  [/^(address|location address|ünvan|adres)$/, "address"],
  [/^(available|availability|in stock|stock status)$/, "availability"],
];

export function attributeKey(attribute: string): string {
  const a = normalizeText(attribute);
  return ATTRIBUTE_SYNONYMS.find(([re]) => re.test(a))?.[1] ?? a;
}

/** "Classic  Burger!" and "classic burger" are the same entity. */
export function entityKey(entity: string): string {
  return normalizeText(entity).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function factKey(entity: string, attribute: string): string {
  return `${entityKey(entity)}|${attributeKey(attribute)}`;
}

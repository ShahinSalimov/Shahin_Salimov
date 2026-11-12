/** Value parsing and normalization so the same fact compares equal across assets. */

const SYMBOLS: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "₼": "AZN", "₺": "TRY", "¥": "JPY", "₽": "RUB" };
const CODES = ["USD", "EUR", "GBP", "AZN", "TRY", "JPY", "RUB", "CAD", "AUD", "CHF"];
const WORDS: Record<string, string> = { manat: "AZN", tl: "TRY" };

const AMOUNT = String.raw`\d{1,3}(?:[.,  ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const SYM = String.raw`[$€£₼₺¥₽]`;
const CODE = String.raw`(?:${CODES.join("|")}|AZN|manat|TL)`;
/** Matches "$12.00", "12,50 €", "USD 15", "15 AZN", "19 manat". */
export const MONEY_RE = new RegExp(
  String.raw`(?:(${SYM})\s?(${AMOUNT})|(${AMOUNT})\s?(${SYM})|\b(${CODE})\s?(${AMOUNT})\b|\b(${AMOUNT})\s?(${CODE})\b)`,
  "gi",
);

export interface Money {
  raw: string;
  amount: number;
  currency: string;
  index: number;
}

/** "1,234.56" → 1234.56, "1.234,56" → 1234.56, "12,50" → 12.5 */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[  ]/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma > -1 && lastDot > -1) {
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // "12,50" decimal vs "1,234" thousands
    normalized = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot > -1) {
    // "1.234.567" or "1.234" → thousands separators; "12.5" / "12.50" → decimal
    normalized = s.split(".").length > 2 || /\.\d{3}$/.test(s) ? s.replace(/\./g, "") : s;
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function currencyOf(token: string): string {
  const t = token.trim();
  return SYMBOLS[t] ?? WORDS[t.toLowerCase()] ?? t.toUpperCase();
}

export function findMoney(text: string): Money[] {
  const out: Money[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const [raw, s1, a1, a2, s2, c3, a3, a4, c4] = m;
    const amountRaw = a1 ?? a2 ?? a3 ?? a4;
    const cur = s1 ?? s2 ?? c3 ?? c4;
    if (!amountRaw || !cur) continue;
    const amount = parseAmount(amountRaw);
    if (amount === null || amount > 10_000_000) continue;
    out.push({ raw: raw.trim(), amount, currency: currencyOf(cur), index: m.index ?? 0 });
  }
  return out;
}

export function formatMoneyKey(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

/** Keeps a leading "+" and digits: "+1 (555) 014-2" → "+15550142". */
export function normalizePhone(raw: string): string {
  const plus = raw.trim().startsWith("+") ? "+" : "";
  return plus + raw.replace(/\D/g, "");
}

export const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]?\d{2,4}){1,4}/g;
export const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}\b/gi;
const DAY = String.raw`(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|daily|every\s*day|weekdays|weekends)`;
const TIME = String.raw`\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?`;
export const HOURS_RE = new RegExp(String.raw`${DAY}(?:\s*[-–—,&/]\s*${DAY})*\s*:?\s*${TIME}\s*(?:-|–|—|to)\s*${TIME}`, "gi");

export function isPlausiblePhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function normalizeText(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function normalizeHours(s: string): string {
  return normalizeText(s).replace(/[–—]/g, "-").replace(/\s*-\s*/g, "-").replace(/\s*to\s*/g, "-");
}

const PRICE_ATTR = /^(price|cost|amount|fee|rate|unit price|retail price|wholesale price|qiymət|fiyat)$/i;
const PHONE_ATTR = /(phone|tel|telephone|mobile|telefon)/i;
const EMAIL_ATTR = /(e-?mail|e-?poçt|e-?posta)/i;
const HOURS_ATTR = /(hours|opening|açıq|açılış|çalışma)/i;

export interface NormalizedValue {
  normalized: string;
  number: number | null;
  unit: string | null;
}

/** Normalizes a value according to what the attribute is about. */
export function normalizeValue(attribute: string, value: string): NormalizedValue {
  const v = value.trim();
  if (PRICE_ATTR.test(attribute.trim()) || findMoney(v)[0]?.raw === v) {
    const money = findMoney(v)[0];
    if (money) return { normalized: formatMoneyKey(money.amount, money.currency), number: money.amount, unit: money.currency };
    const n = parseAmount(v.replace(/[^\d.,]/g, ""));
    if (n !== null && /^[\s\d.,]+$/.test(v)) return { normalized: n.toFixed(2), number: n, unit: null };
  }
  if (PHONE_ATTR.test(attribute) && isPlausiblePhone(v)) return { normalized: normalizePhone(v), number: null, unit: null };
  if (EMAIL_ATTR.test(attribute)) return { normalized: v.toLowerCase(), number: null, unit: null };
  if (HOURS_ATTR.test(attribute)) return { normalized: normalizeHours(v), number: null, unit: null };
  if (/^-?\d+(?:[.,]\d+)?$/.test(v)) {
    const n = parseAmount(v.replace(/^-/, ""));
    if (n !== null) {
      const signed = v.startsWith("-") ? -n : n;
      return { normalized: String(signed), number: signed, unit: null };
    }
  }
  return { normalized: normalizeText(v), number: null, unit: null };
}

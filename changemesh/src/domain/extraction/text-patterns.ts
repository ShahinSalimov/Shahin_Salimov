import { EMAIL_RE, findMoney, HOURS_RE, isPlausiblePhone, PHONE_RE } from "./normalize";
import { makeFact, type ExtractionMethod, type FactDraft, type SourceLocation } from "./fact";

export interface TextLine {
  text: string;
  location: SourceLocation;
}

const PHONE_HINT = /\b(tel|phone|call|telefon|tél|mobile|whatsapp)\b/i;
const LEADER = /[\s.·…_\-–—:|]+$/;

/** Text before a price, cleaned of dot leaders: "Classic Burger ........ $12" → "Classic Burger". */
function labelBefore(text: string, end: number, start = 0): string {
  return text.slice(start, end).replace(LEADER, "").replace(/^[\s\-–—•*·|:]+/, "").trim();
}

function isGoodLabel(label: string): boolean {
  return label.length >= 2 && label.length <= 120 && /\p{L}{2,}/u.test(label);
}

/**
 * Heuristic extraction from lines of text (web pages, PDFs, text files).
 * Confidence is deliberately modest: these are pattern matches, not structure.
 */
export function extractFromLines(lines: TextLine[], opts: { method: ExtractionMethod; defaultEntity: string }): FactDraft[] {
  const facts: FactDraft[] = [];
  const push = (f: FactDraft | null) => {
    if (f) facts.push(f);
  };

  for (const { text, location } of lines) {
    if (!text || text.length > 2000) continue;
    const loc = { ...location, snippet: text.slice(0, 200) };

    // Prices: label = text between the previous price (or line start) and this one.
    const money = findMoney(text);
    let cursor = 0;
    for (const m of money) {
      const label = labelBefore(text, m.index, cursor);
      cursor = m.index + m.raw.length;
      if (!isGoodLabel(label)) continue;
      const leader = /\.{3,}|…|\t| {3,}/.test(text);
      push(makeFact(label, "price", m.raw, loc, leader ? 0.7 : 0.6, opts.method));
    }

    // Emails
    for (const m of text.matchAll(EMAIL_RE)) push(makeFact(opts.defaultEntity, "email", m[0], loc, 0.8, opts.method));

    // Opening hours
    for (const m of text.matchAll(HOURS_RE)) push(makeFact(opts.defaultEntity, "opening hours", m[0], loc, 0.6, opts.method));

    // Phone numbers: only with a "+" prefix or a phone keyword on the line, to avoid prices, dates and IDs.
    const hinted = PHONE_HINT.test(text);
    for (const m of text.matchAll(PHONE_RE)) {
      const raw = m[0].trim();
      if (!isPlausiblePhone(raw)) continue;
      if (!raw.startsWith("+") && !hinted) continue;
      if (money.some((mm) => mm.raw.includes(raw) || raw.includes(mm.raw))) continue;
      push(makeFact(opts.defaultEntity, "phone", raw, loc, raw.startsWith("+") ? 0.65 : 0.6, opts.method));
    }
  }
  return facts;
}

import { describe, expect, it } from "vitest";
import { findMoney, normalizeHours, normalizePhone, normalizeValue, parseAmount } from "./normalize";
import { cleanInline, cleanMultiline } from "./sanitize";

describe("parseAmount", () => {
  it.each([
    ["12", 12],
    ["12.5", 12.5],
    ["12,50", 12.5],
    ["1,234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["1,234", 1234],
    ["1.234", 1234],
    ["1 234,50", 1234.5],
    ["abc", null],
  ])("%s → %s", (raw, expected) => expect(parseAmount(raw)).toBe(expected));
});

describe("findMoney", () => {
  it("finds symbols, codes and words before or after amounts", () => {
    const found = findMoney("Burger $12.00, Risotto 19,50 €, Wine USD 30, Tea 4 AZN, Kebab 120 TL, Dolma 9 manat");
    expect(found.map((m) => [m.amount, m.currency])).toEqual([
      [12, "USD"],
      [19.5, "EUR"],
      [30, "USD"],
      [4, "AZN"],
      [120, "TRY"],
      [9, "AZN"],
    ]);
  });
  it("ignores plain numbers without a currency", () => {
    expect(findMoney("Table 12 seats 4 people since 1998")).toEqual([]);
  });
});

describe("normalizeValue", () => {
  it("normalizes prices so that $15 and 15.00 USD compare equal", () => {
    expect(normalizeValue("price", "$15").normalized).toBe("USD 15.00");
    expect(normalizeValue("price", "USD 15.00").normalized).toBe("USD 15.00");
    expect(normalizeValue("price", "15").normalized).toBe("15.00");
    expect(normalizeValue("Price", "$15").number).toBe(15);
  });
  it("normalizes phones, emails and hours", () => {
    expect(normalizeValue("phone", "+1 (555) 014-2").normalized).toBe("+15550142");
    expect(normalizePhone("555-0142")).toBe("5550142");
    expect(normalizeValue("email", "Hello@HarborVine.example").normalized).toBe("hello@harborvine.example");
    expect(normalizeHours("Mon–Sun 11:00 – 23:00")).toBe("mon-sun 11:00-23:00");
  });
  it("normalizes plain text and numbers", () => {
    expect(normalizeValue("availability", "  In  Stock ").normalized).toBe("in stock");
    expect(normalizeValue("seats", "42").number).toBe(42);
  });
});

describe("sanitize", () => {
  it("removes control, zero-width and bidi override characters", () => {
    expect(cleanInline("Price\u0000 $12​‮00.21$‬")).toBe("Price $1200.21$");
  });
  it("caps length", () => {
    expect(cleanInline("x".repeat(50), 10)).toBe(`${"x".repeat(9)}…`);
  });
  it("keeps line structure in multiline text", () => {
    expect(cleanMultiline("a  b\r\n\r\n\r\nc\t d")).toBe("a b\n\nc d");
  });
});

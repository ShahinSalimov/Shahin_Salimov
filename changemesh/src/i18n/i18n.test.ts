import { describe, expect, it } from "vitest";
import { matchLocale } from "./config";
import { MESSAGES } from "./messages";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => (typeof v === "string" ? [`${prefix}${k}`] : keys(v as object, `${prefix}${k}.`)));
}

describe("i18n", () => {
  it("has identical keys and no empty strings in every locale", () => {
    const reference = keys(MESSAGES.en).sort();
    for (const [locale, messages] of Object.entries(MESSAGES)) {
      expect(keys(messages).sort(), locale).toEqual(reference);
      for (const k of keys(messages)) {
        const value = k.split(".").reduce<unknown>((o, part) => (o as Record<string, unknown>)[part], messages);
        expect(String(value).trim().length, `${locale}:${k}`).toBeGreaterThan(0);
      }
    }
  });

  it("matches Accept-Language headers", () => {
    expect(matchLocale("az-AZ,az;q=0.9,en;q=0.8")).toBe("az");
    expect(matchLocale("de-DE,tr;q=0.7")).toBe("tr");
    expect(matchLocale("fr-FR")).toBe("en");
    expect(matchLocale(null)).toBe("en");
  });
});

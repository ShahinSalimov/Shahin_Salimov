/** URL-safe slug: lowercase ASCII letters, digits and single hyphens, 2–48 chars. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

const TRANSLITERATION: Record<string, string> = {
  ə: "e", ı: "i", ş: "s", ç: "c", ğ: "g", ö: "o", ü: "u", İ: "i", Ə: "e", Ş: "s", Ç: "c", Ğ: "g", Ö: "o", Ü: "u",
};

export function slugify(input: string): string {
  const transliterated = [...input].map((ch) => TRANSLITERATION[ch] ?? ch).join("");
  const slug = transliterated
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug.length >= 2 ? slug : `ws-${slug || "new"}`;
}

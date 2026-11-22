// Guards that keep the account safe: brand/IP (eBay VeRO) and restricted items.
// Extend these lists as you learn your categories.

const BRANDS = [
  "apple", "iphone", "airpods", "ipad", "macbook", "samsung", "galaxy", "sony", "playstation", "nintendo",
  "xbox", "microsoft", "nike", "adidas", "puma", "reebok", "new balance", "under armour", "gucci",
  "louis vuitton", "chanel", "prada", "hermes", "rolex", "cartier", "michael kors", "coach", "ray-ban",
  "oakley", "disney", "marvel", "pokemon", "lego", "barbie", "hello kitty", "harry potter", "star wars",
  "nfl", "nba", "mlb", "fifa", "dyson", "bose", "beats", "jbl", "gopro", "canon", "nikon", "lv",
  "north face", "supreme", "yeti", "stanley", "tiffany", "pandora", "swarovski", "otterbox", "anker",
  "spiderman", "spider-man", "batman", "minecraft", "fortnite", "peppa", "paw patrol", "sanrio",
];

const RESTRICTED = [
  "knife", "dagger", "sword", "gun", "pistol", "rifle", "ammo", "taser", "stun", "pepper spray",
  "vape", "e-cigarette", "cbd", "thc", "drug", "pill", "supplement", "medicine", "medical", "syringe",
  "contact lens", "laser pointer", "drone", "lithium battery pack", "replica", "counterfeit", "aaa quality",
  "1:1", "fake", "adult", "sex", "lingerie", "baby formula", "cosmetic injection", "teeth whitening gel",
];

function matchWord(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

export type FilterResult = { ok: true } | { ok: false; reason: string };

export function checkProductSafety(title: string, description = ""): FilterResult {
  const text = `${title} ${description}`.toLowerCase();
  const brand = BRANDS.find((b) => matchWord(text, b));
  if (brand) return { ok: false, reason: `brand/IP risk: "${brand}"` };
  const restricted = RESTRICTED.find((r) => matchWord(text, r));
  if (restricted) return { ok: false, reason: `restricted item: "${restricted}"` };
  return { ok: true };
}

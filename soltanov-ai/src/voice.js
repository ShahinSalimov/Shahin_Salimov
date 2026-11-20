// Voice command router: one spoken request -> the right feature.
// "Mənə zal mövzusunda reels ideyaları hazırla" -> custom ideas
// "X brendi reklam istəyir..."                  -> 5 ad scripts
// "Axşam ideyalarını dəyiş"                      -> refresh slot
// "Bundan sonra daha çox yumor olsun"            -> permanent wish in profile
// "Qiyməti hesabla" / "teleprompteri aç"         -> open a proq tool
import { aiEnabled, generateJSON } from "./ai/claude.js";
import { SYSTEM_ROUTER, ROUTER_SCHEMA } from "./ai/prompts.js";

const SLOT_WORDS = { morning: /səhər/i, noon: /günorta|nahar/i, evening: /axşam|gecə/i };

export function routeOffline(text, context = "") {
  const t = String(text).toLocaleLowerCase("az");
  const has = (rx) => rx.test(t);
  const slot = Object.keys(SLOT_WORDS).find((k) => SLOT_WORDS[k].test(t)) || "none";
  const count = Math.min(5, Math.max(1, parseInt((t.match(/(\d+)\s*(ədəd|dənə|ideya|fikir)?/) || [])[1], 10) || 3));
  const base = { request: String(text).trim(), count, slot, tool: "none", wish: "" };

  if (has(/teleprompter|suflyor/)) return { ...base, intent: "tool", tool: "teleprompter" };
  if (has(/qiymət|neçəyə|kalkulyator|hesabla|honorar/)) return { ...base, intent: "tool", tool: "pricing" };
  if (has(/müqavilə|checklist|şərtlər/)) return { ...base, intent: "tool", tool: "contract" };
  if (has(/təqvim|plan(la)?(ş|n)/)) return { ...base, intent: "tool", tool: "calendar" };
  if (has(/bundan sonra|həmişə|heç vaxt|daha çox|daha az|istəmirəm|xoşum gəlmir|sevmirəm/) && !has(/hazırla|ver\b/))
    return { ...base, intent: "profile", wish: String(text).trim() };
  if (has(/reklam|brend|sponsor|əməkdaşlıq|inteqrasiya|məhsul/)) return { ...base, intent: "ad" };
  if (slot !== "none" && has(/dəyiş|yenilə|başqa|təzə/)) return { ...base, intent: "refresh" };
  if (has(/ideya|fikir|mövzu|reels|rils|video|çək/)) return { ...base, intent: "ideas" };
  // Fall back to the screen the user is on.
  if (context === "ad") return { ...base, intent: "ad" };
  if (context === "me") return { ...base, intent: "profile", wish: String(text).trim() };
  return { ...base, intent: "ideas" };
}

export async function routeCommand(text, context, store, acc) {
  if (aiEnabled()) {
    try {
      const { data } = await generateJSON({
        system: SYSTEM_ROUTER,
        user: `Hazırda açıq olan bölmə: ${context || "bilinmir"}\nİstək: """${String(text).slice(0, 3000)}"""`,
        schema: ROUTER_SCHEMA,
        maxTokens: 4000,
      });
      if (data.intent !== "unknown") return { ...data, request: data.request || text, wish: data.wish || text };
    } catch (e) {
      store.log("ai.error", { accountId: acc.id, scope: "router", message: String(e.message).slice(0, 200) });
    }
  }
  return routeOffline(text, context);
}

export function slotIndexOf(slot, now = null) {
  return { morning: 0, noon: 1, evening: 2 }[slot] ?? now;
}

export function addWish(acc, wish) {
  const clean = String(wish || "").trim().slice(0, 300);
  if (!clean) return acc.profile?.wishes || "";
  const prev = (acc.profile?.wishes || "").split("\n").filter(Boolean);
  const next = [...prev.filter((w) => w !== clean), clean].slice(-10);
  acc.profile = { ...(acc.profile || {}), wishes: next.join("\n") };
  return acc.profile.wishes;
}

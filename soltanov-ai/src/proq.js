// "Proq" engine — suggests a helper tool/module when the workflow shows a real need.
// Every suggested tool exists inside the app (public/app.js -> TOOLS).

export const TOOLS = {
  teleprompter: { id: "teleprompter", name: "Teleprompter", desc: "Ssenarini ekranda sürüşdür, kameraya baxaraq oxu." },
  pricing: { id: "pricing", name: "Reklam qiymət kalkulyatoru", desc: "İzləyici sayı, ER və formata görə qiymət aralığı." },
  contract: { id: "contract", name: "Brend müqavilə checklist", desc: "Razılaşmadan əvvəl yoxlanmalı 12 bənd." },
  calendar: { id: "calendar", name: "Kontent təqvimi", desc: "Çəkiləcək və paylaşılacaq videoları tarixə düz." },
  profile: { id: "profile", name: "Profil tənzimləmə", desc: "İdeyalar xarakterinə daha dəqiq uyğunlaşsın." },
  telegram: { id: "telegram", name: "Telegram bildirişi", desc: "09:00, 13:00, 19:00 ideyaları telefona gəlsin." },
};

const RX = {
  pricing: /qiymət|büdcə|budce|ödəniş|odenis|pul|manat|azn|\$|neçəyə|honorar|price/i,
  contract: /müqavilə|muqavile|şərt|sert|eksklüziv|ekskluziv|razılaşma|hüquq|kontrakt/i,
  deadline: /tarix|sabah|həftə|hefte|gün ərzində|deadline|son tarix|\d{1,2}\s*(yanvar|fevral|mart|aprel|may|iyun|iyul|avqust|sentyabr|oktyabr|noyabr|dekabr)/i,
};

export function suggestForAd(adRecord) {
  const text = `${adRecord.transcript} ${(adRecord.proqHints || []).join(" ")}`;
  const out = [{ ...TOOLS.teleprompter, reason: "Ssenari hazırdır — çəkilişdə mətni əzbərləməyə ehtiyac yoxdur." }];
  if (RX.pricing.test(text)) out.push({ ...TOOLS.pricing, reason: "Brifdə qiymət/ödəniş mövzusu var — təklifi əsaslandır." });
  if (RX.contract.test(text) || (adRecord.brief?.requirements || []).length >= 3)
    out.push({ ...TOOLS.contract, reason: "Brifdə şərtlər var — razılaşmadan əvvəl yoxla." });
  if (RX.deadline.test(text) || adRecord.brief?.deadline) out.push({ ...TOOLS.calendar, reason: "Son tarix qeyd olunub — çəkilişi təqvimə sal." });
  for (const hint of (adRecord.proqHints || []).slice(0, 2)) out.push({ id: "hint", name: "AI təklifi", desc: hint, reason: "Brifə əsasən" });
  return out;
}

export function suggestForDashboard(acc, ideas, now = Date.now()) {
  const out = [];
  const week = ideas.filter((i) => now - Date.parse(i.createdAt) < 7 * 864e5);
  const skipped = week.filter((i) => i.status === "skipped").length;
  const shotNotPosted = ideas.filter((i) => i.status === "shot").length;
  if (!acc.profile?.sport || skipped >= 5)
    out.push({ ...TOOLS.profile, reason: skipped >= 5 ? `Bu həftə ${skipped} ideya keçildi — profili dəqiqləşdirək.` : "Profil tam doldurulmayıb." });
  if (shotNotPosted >= 3) out.push({ ...TOOLS.calendar, reason: `${shotNotPosted} video çəkilib, amma paylaşılmayıb — paylaşım planı qur.` });
  if (!acc.telegramChatId) out.push({ ...TOOLS.telegram, reason: "İdeyalar vaxtında telefona gəlsin." });
  return out;
}

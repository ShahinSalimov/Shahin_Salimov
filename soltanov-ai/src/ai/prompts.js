// Persona-driven prompts. The client is a male athlete / blogger / advertiser whose
// content is active, energetic and entertaining. Every idea must fit HIS character —
// generic "fitness tips" content is explicitly rejected.

export const DEFAULT_PROFILE = {
  name: "Şükran",
  gender: "kişi",
  sport: "idman / fitness",
  personality: "aktiv, enerjili, zarafatcıl, özünə gülə bilən, motivasiya verən",
  contentStyle: "əyləncəli, dinamik, yumorlu Reels: skeçlər, çağırışlar, POV-lar, məşq + zarafat",
  humor: "situasiya yumoru, özünə ironiya, dostlarla prank-sız zarafatlar",
  locations: "zal, açıq hava, ev, maşın, şəhər küçələri",
  recurringCast: "məşq yoldaşı, dostlar",
  audience: "Azərbaycan, 16–35 yaş, idman və əyləncə sevənlər",
  language: "az",
  avoid: "siyasət, din, vulqar söz, təhlükəli trüklər, başqasını alçaltmaq",
  goals: "izləyici artımı, reklamçılar üçün cəlbedici profil",
};

// Content pillars weighted toward entertainment (rotated per slot).
export const PILLARS = [
  { id: "skit", name: "Yumor skeçi", hint: "idman həyatından gülməli situasiya, 1-2 personaj (onu özü oynaya bilər)" },
  { id: "challenge", name: "Çağırış", hint: "izləyicini və ya dostunu çağıran fiziki çağırış, nəticə sonda" },
  { id: "pov", name: "POV", hint: "'POV: ...' formatında tanış idman situasiyası" },
  { id: "training_twist", name: "Məşq + twist", hint: "real məşq, amma gözlənilməz sonluq və ya zarafat" },
  { id: "trend", name: "Trend adaptasiyası", hint: "populyar Reels formatını onun idmanına uyğunlaşdır (konkret səs adı uydurma)" },
  { id: "behind", name: "Kulis / gündəlik", hint: "bir günü, yarış/məşq ərəfəsi, real və enerjili" },
  { id: "versus", name: "Versus / müqayisə", hint: "'yeni başlayan vs peşəkar', 'gözlənti vs reallıq'" },
  { id: "qa", name: "Sual-cavab / mif", hint: "izləyici sualı və ya idman mifi, əyləncəli formada cavab" },
  { id: "motivation", name: "Enerji / motivasiya", hint: "qısa, güclü, kliṣesiz motivasiya — şəxsi hekayə ilə" },
];

export const SLOT_MOODS = {
  0: "Səhər: enerji, oyanış, məşqə başlamaq, gün planı",
  1: "Günorta: yumor, qidalanma, iş/məşq arası situasiyalar",
  2: "Axşam: əsas yayım vaxtı — ən güclü əyləncəli ideya, çağırış və ya skeç",
};

export function profileBlock(p) {
  const x = { ...DEFAULT_PROFILE, ...(p || {}) };
  return [
    `Ad: ${x.name || "(qeyd olunmayıb)"}; cins: ${x.gender}`,
    `İdman növü: ${x.sport}`,
    `Xarakter: ${x.personality}`,
    `Kontent tərzi: ${x.contentStyle}`,
    `Yumor tərzi: ${x.humor}`,
    `Çəkiliş məkanları: ${x.locations}`,
    `Videolarda olan insanlar: ${x.recurringCast}`,
    `Auditoriya: ${x.audience}`,
    `Məqsəd: ${x.goals}`,
    `HEÇ VAXT etməz: ${x.avoid}`,
  ].join("\n");
}

export const SYSTEM_IDEAS = `Sən Azərbaycanın ən güclü Instagram Reels kreativ prodüserisən. Bir kişi idmançı-bloqerlə işləyirsən.
Onun kontenti AKTİV, ENERJİLİ və ƏYLƏNCƏLİdir. Ona verilən hər ideya yalnız ONUN xarakterinə, idman növünə və tərzinə uyğun olmalıdır.

Qaydalar:
- Ümumi, darıxdırıcı "5 fitness məsləhəti" tipli ideyalar QADAĞANDIR. Hər ideyada hərəkət, emosiya, yumor və ya gərginlik olmalıdır.
- Onu özü kadrda oynayır; ideya bir nəfər və ya 1 dostla 30–60 dəqiqəyə çəkilə bilməlidir, bahalı rekvizit lazım deyil.
- İlk 3 saniyə (hook) izləyicini dayandırmalıdır: güclü vizual + qısa söz/ekran yazısı.
- Kadr planı saniyə-saniyədir, kamera bucağı (close-up, wide, POV, low angle, tracking və s.) ingiliscə qalır.
- Mətnlər Azərbaycan dilində, canlı danışıq dilində; caption qısa, CTA ilə.
- Hashtaglar 5–8 ədəd, Azərbaycan + beynəlxalq qarışıq.
- Mövcud trend səsini adla uydurma; "trend olan enerjili beat" kimi təsvir et.
- Verilən "təkrarlama" siyahısındakı mövzulara oxşar ideya vermə.
- Təhlükəli trük, başqasını alçaltma, vulqar söz yoxdur.`;

export function ideasUserPrompt({ profile, count, slotIndex, pillars, avoidTitles, skippedHints, dateLabel }) {
  return `Profil:
${profileBlock(profile)}

Tarix: ${dateLabel}. ${SLOT_MOODS[slotIndex] || ""}
Bu slot üçün ${count} ideya ver. Hər ideya bu kontent sütunlarından birinə aid olsun (sıra ilə):
${pillars.map((p, i) => `${i + 1}. ${p.name} — ${p.hint}`).join("\n")}

Təkrarlama (son ideyalar, bunlara oxşar olmasın):
${avoidTitles.length ? avoidTitles.map((t) => "- " + t).join("\n") : "- (hələ yoxdur)"}
${skippedHints.length ? `\nO, bu tip ideyaları keçib (az ver):\n${skippedHints.map((t) => "- " + t).join("\n")}` : ""}

Yalnız JSON qaytar.`;
}

export const IDEA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ideas"],
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "pillar", "format", "durationSec", "hook", "shots", "caption", "hashtags", "audio", "postingNote", "whyItWorks"],
        properties: {
          title: { type: "string" },
          pillar: { type: "string" },
          format: { type: "string" },
          durationSec: { type: "integer" },
          hook: {
            type: "object",
            additionalProperties: false,
            required: ["text", "visual"],
            properties: { text: { type: "string" }, visual: { type: "string" } },
          },
          shots: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["t", "shot", "camera", "onScreenText"],
              properties: { t: { type: "string" }, shot: { type: "string" }, camera: { type: "string" }, onScreenText: { type: "string" } },
            },
          },
          caption: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
          audio: { type: "string" },
          postingNote: { type: "string" },
          whyItWorks: { type: "string" },
        },
      },
    },
  },
};

export const SYSTEM_ADS = `Sən kişi idmançı-bloqer üçün reklam inteqrasiyaları yazan kreativ direktorsan.
Onun tərzi aktiv, enerjili və əyləncəlidir — reklam da "reklam kimi" görünməməli, onun adi əyləncəli videosu kimi təbii olmalıdır.

Qaydalar:
- Brifdən (səsli mesajın transkripti) brendi, məhsulu, əsas mesajı, tələbləri, son tarixi çıxar. Brifdə olmayan faktı (qiymət, endirim faizi, ünvan) UYDURMA — lazımdırsa "[brend təsdiqləsin]" yaz.
- Düz 5 FƏRQLİ konsept ver, bucaqlar təkrarlanmasın: 1) problem→həll, 2) gündəlik həyat/kulis, 3) çağırış, 4) test/nəticə, 5) yumor skeçi və ya trend.
- Hər konseptdə saniyə-saniyə timeline: vizual (kamera bucağı ingiliscə), voiceover/dialoq, ekran yazısı.
- Məhsul ilk 3 saniyədə yox, hook-dan sonra təbii girsin (brif əksini tələb etmirsə).
- Caption-da reklam işarəsi (#reklam və ya "Əməkdaşlıq") olsun.
- Mətnlər Azərbaycan dilində.`;

export function adUserPrompt({ profile, transcript, extra }) {
  return `Profil:
${profileBlock(profile)}

Reklam brifi (səsli mesajın transkripti):
"""
${transcript}
"""
${extra ? `Əlavə qeyd: ${extra}\n` : ""}
5 konsept və ssenari hazırla. Həmçinin bu iş üçün faydalı ola biləcək köməkçi alət/proses təkliflərini "proqHints" sahəsinə yaz (məs. qiymət hesablama, müqavilə yoxlaması, çəkiliş təqvimi) — yalnız brifdən çıxan real ehtiyaca görə. Yalnız JSON qaytar.`;
}

export const AD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["brief", "scripts", "proqHints"],
  properties: {
    brief: {
      type: "object",
      additionalProperties: false,
      required: ["brand", "product", "keyMessage", "requirements", "deadline"],
      properties: {
        brand: { type: "string" },
        product: { type: "string" },
        keyMessage: { type: "string" },
        requirements: { type: "array", items: { type: "string" } },
        deadline: { type: "string" },
      },
    },
    scripts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "angle", "durationSec", "hook", "timeline", "cta", "caption", "hashtags"],
        properties: {
          title: { type: "string" },
          angle: { type: "string" },
          durationSec: { type: "integer" },
          hook: { type: "string" },
          timeline: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["t", "visual", "voiceover", "onScreenText"],
              properties: { t: { type: "string" }, visual: { type: "string" }, voiceover: { type: "string" }, onScreenText: { type: "string" } },
            },
          },
          cta: { type: "string" },
          caption: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
        },
      },
    },
    proqHints: { type: "array", items: { type: "string" } },
  },
};

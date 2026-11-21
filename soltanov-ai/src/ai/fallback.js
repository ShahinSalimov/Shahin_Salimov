// Offline generator — used when ANTHROPIC_API_KEY is missing or the AI call fails.
// Template bank tuned for an energetic, humorous male athlete. Lower quality than AI,
// but the product never shows an empty screen.
import { DEFAULT_PROFILE } from "./prompts.js";

const T = {
  skit: [
    ["Zalda 'son dəst' deyən hər kəs", "“Son dəst” deyib 5 dəst də vuran mən", "Ağırlığın yanında yorğun oturmuş, kameraya baxıb barmaqla '1' göstərir"],
    ["Məşq yoldaşım vs mənim motivasiyam", "Məşq yoldaşım: 'bu gün yüngül'. Həmişə yalan", "Dost gülümsəyərək ağır disk gətirir, sən dəhşətlə baxırsan"],
    ["Ana: 'bir az da ye'", "İdmançının ən güclü rəqibi — ana", "Masada boşqab dolu, sən dietadakı kimi qorxu ilə baxırsan"],
    ["Zala ilk dəfə gələn mən (5 il əvvəl)", "5 il əvvəlki mən bu zalda belə idim", "Köhnə paltar, maşını səhv istifadə edən 'keçmiş sən'"],
  ],
  challenge: [
    ["60 saniyədə maksimum {move}", "60 saniyə. Neçə {move}? Təxmin et", "Taymerin yaxından görüntüsü, start siqnalı"],
    ["Dostumu çağırıram: kim çox dayanar?", "Uduzan bütün həftə yemək alır", "İki nəfər üz-üzə, ortada taymer"],
    ["İzləyicilərin seçdiyi məşq", "Şərhdə ən çox bəyənilən məşqi edirəm", "Telefon ekranında şərhləri sürüşdürür, birini seçir"],
  ],
  pov: [
    ["POV: ayaq günüdür və pilləkən var", "POV: ayaq günündən sonra 3-cü mərtəbə", "Pilləkənin aşağıdan low angle görüntüsü, sən ah çəkirsən"],
    ["POV: zalda telefonla danışan adam", "POV: sənin aparatını 20 dəqiqə tutub danışan adam", "Kənarda gözləyən sən, saata baxırsan"],
    ["POV: yarışdan bir gün əvvəl", "POV: sabah yarışdır, yuxu gəlmir", "Qaranlıq otaq, tavana baxırsan, telefon işığı"],
  ],
  training_twist: [
    ["Ən çətin 3 hərəkət... sonuncu gözlənilməz", "3-cü hərəkəti heç kim etmir", "Sürətli kəsimlərlə 2 hərəkət, sonra donur"],
    ["Ev şəraitində {sport} məşqi — rekvizit yoxdur", "Zal bağlıdır? Problem deyil", "Evdə stul, çanta, su şüşəsi düzülür"],
  ],
  trend: [
    ["Trend: 'gözlənti vs reallıq' — {sport} versiyası", "İnstaqramda {sport} vs real {sport}", "Ekran ikiyə bölünür: gözəl kadr vs tər içində sən"],
    ["Trend keçid: adi geyimdən idman formasına", "3, 2, 1...", "Barmaq şaqqıltısı ilə keçid, transition"],
  ],
  behind: [
    ["Yarışçının bir günü — 30 saniyədə", "Səhər 06:00. Başlayırıq", "Zəngli saatın close-up görüntüsü, yataqdan sıçrayış"],
    ["Çantamda nə var? İdmançı versiyası", "Çantamda heç kim bunu gözləmir", "Çantanı masaya boşaldırsan, sonda gülməli əşya"],
  ],
  versus: [
    ["Yeni başlayan vs peşəkar: {move}", "Fərqi 3 saniyədə gör", "Split screen: səhv və düzgün icra"],
    ["Bazar ertəsi mən vs cümə mən", "Bazar ertəsi motivasiya 100%", "Bazar ertəsi enerjili giriş, cümə yorğun sürünərək"],
  ],
  qa: [
    ["Mif: 'Gecə yemək kökəldir' — əsl cavab", "Bunu hamı səhv bilir", "Gecə soyuducunu açırsan, kameraya dönürsən"],
    ["İzləyici sualı: neçə ildir məşq edirsən?", "Ən çox soruşulan sual", "Şərhin skrinşotu ekranda, sən yanında"],
  ],
  motivation: [
    ["Heç kim görməyəndə məşq", "Bu kadrları heç kim görmür", "Boş zal, səhər qaranlığı, tək sən"],
    ["Uduzduğum yarış mənə nə öyrətdi", "Bu gün uduzduğum günü göstərirəm", "Köhnə foto/medalsız an, sonra indiki məşq"],
  ],
};

const MOVES = ["şınaq", "turnik", "squat", "burpee", "plank"];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function topicFrom(request) {
  return String(request || "")
    .replace(/[.!?]+$/g, "")
    .replace(/(^|\s)(mənə|bizə|zəhmət olmasa|xahiş edirəm|bir|neçə|\d+)(?=\s|$)/giu, " ")
    .replace(/(reels|rils|video)?\s*(ideyaları|ideyası|ideya|fikirləri|fikir|mövzuları)\s*(hazırla|ver|tap|düşün|yaz|lazımdır)?/gi, "")
    .replace(/(^|\s)(mövzusunda|mövzusuna|haqqında|ilə bağlı|üçün)(?=\s|$)/giu, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 60);
}

export function offlineIdeas({ profile, pillars, seed = Date.now(), exclude = () => false, request = "" }) {
  const topic = topicFrom(request);
  const p = { ...DEFAULT_PROFILE, ...(profile || {}) };
  const sport = p.sport.split(/[,/]/)[0].trim() || "idman";
  const r = rng(seed);
  const out = [];
  for (const pillar of pillars) {
    const bank = T[pillar.id] || T.skit;
    const order = bank.map((_, i) => i).sort(() => r() - 0.5);
    let picked = null;
    for (const i of order) {
      const move = MOVES[Math.floor(r() * MOVES.length)];
      const fill = (s) => s.replaceAll("{sport}", sport).replaceAll("{move}", move);
      const [title, hookText, hookVisual] = bank[i].map(fill);
      const fullTitle = topic ? `${topic[0].toLocaleUpperCase("az") + topic.slice(1)} — ${title}` : title;
      if (exclude(fullTitle) || out.some((o) => o.title === fullTitle)) continue;
      picked = { title: fullTitle, hookText, hookVisual };
      break;
    }
    if (!picked) continue;
    out.push({
      title: picked.title,
      pillar: pillar.name,
      format: pillar.id === "pov" ? "POV" : pillar.id === "versus" ? "Split screen" : "Reels / TikTok 9:16",
      durationSec: 20,
      hook: { text: picked.hookText, visual: picked.hookVisual },
      shots: [
        { t: "0-3s", shot: picked.hookVisual, camera: "close-up, handheld", onScreenText: picked.hookText },
        { t: "3-10s", shot: "Situasiyanın inkişafı — hərəkət, mimika, sürətli kəsimlər", camera: "medium shot, jump cuts", onScreenText: "" },
        { t: "10-17s", shot: "Kulminasiya: gözlənilməz an və ya nəticə", camera: "wide shot / low angle", onScreenText: "Gözlə..." },
        { t: "17-20s", shot: "Kameraya baxıb gülümsəmə + CTA jesti", camera: "close-up", onScreenText: "Səndə necədir? 👇" },
      ],
      caption: `${picked.hookText}. Səndə də belə olur? Şərhdə yaz 👇`,
      hashtags: ["#reels", "#idman", "#fitness", "#azerbaijan", "#baku", "#gym", "#motivasiya"],
      audio: "Enerjili, trend olan beat (sürətli tempo)",
      postingNote: "Paylaşımdan sonra ilk 30 dəqiqədə şərhlərə cavab ver; sual verən şərhi pin et.",
      tiktok: {
        caption: `${picked.hookText}. Səndə necədir?`,
        hashtags: ["#fyp", "#azerbaijan", "#idman", "#gym", "#keşfet"],
        note: "Hook-u ekran yazısı kimi ilk saniyədə ver; ən maraqlı şərhə video ilə cavab çək (davamı).",
      },
      whyItWorks: "Tanış situasiya + sürətli tempo + şərhə çağırış izləmə müddətini artırır.",
      offline: true,
    });
  }
  return out;
}

export function offlineAdScripts({ transcript }) {
  const W = "[A-ZƏÖÜĞŞÇİa-zəöüğşçı0-9][\\wəöüğşçıİƏÖÜĞŞÇ-]*";
  const GREET = /^(salam|salamlar|hörmətli|bu|biz|mən|yeni|bizim)$/i;
  const named = transcript.match(new RegExp(`(${W})\\s+(brendi|brend|şirkəti|markası|mağazası)`, "i"))?.[1];
  const capital = (transcript.match(/[A-ZƏÖÜĞŞÇİ][\wəöüğşçıİ-]+/g) || []).find((w) => !GREET.test(w));
  const brand = (named && !GREET.test(named) ? named : capital) || "[brend]";
  const angles = [
    ["Problem → həll", "Məşqdən sonra hamının yaşadığı problem"],
    ["Gündəlik həyat / kulis", "Günümün bir hissəsini göstərirəm"],
    ["Çağırış", "Bu çağırışı {b} ilə edirəm"],
    ["Test / nəticə", "7 gün test etdim — nəticə"],
    ["Yumor skeçi", "Məşq yoldaşım {b}-i gizlətdi..."],
  ];
  return {
    brief: { brand, product: "[brend təsdiqləsin]", keyMessage: transcript.slice(0, 160), requirements: [], deadline: "" },
    scripts: angles.map(([angle, hook]) => {
      const h = hook.replaceAll("{b}", brand);
      return {
        title: `${angle}: ${brand}`,
        angle,
        durationSec: 30,
        hook: h,
        timeline: [
          { t: "0-3s", visual: "Close-up, enerjili giriş", voiceover: h, onScreenText: h },
          { t: "3-12s", visual: "Medium shot — situasiya", voiceover: "Situasiyanı təqdim et", onScreenText: "" },
          { t: "12-22s", visual: "Product shot, təbii istifadə", voiceover: `${brand} burada işə düşür`, onScreenText: brand },
          { t: "22-30s", visual: "Kameraya baxış, CTA", voiceover: "Linki bio-da / sınayın", onScreenText: "Bio-da link" },
        ],
        cta: "Bio-dakı linkə keç",
        caption: `${h} #reklam`,
        hashtags: ["#reklam", "#əməkdaşlıq", "#idman", "#reels"],
        tiktokCaption: `${h} #reklam #fyp`,
      };
    }),
    proqHints: [],
  };
}

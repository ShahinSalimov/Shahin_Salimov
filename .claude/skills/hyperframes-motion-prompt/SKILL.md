---
name: hyperframes-motion-prompt
description: HyperFrames (HTML + GSAP → video) ilə danışan videonun üzərinə motion qrafika, kinetic typography, UI animasiyaları və altyazı əlavə etmək — həm Claude Code-da birbaşa, həm də Claude/ChatGPT söhbət pəncərəsi üçün hazır prompt şablonu. HyperFrames komandaları (doctor, init, check, preview, render) və index.html texniki qaydaları. İstifadəçi "HyperFrames", "motion prompt", "prompt'la elle motion", "ChatGPT ilə motion", "motion kodunu yaz", "index.html render et" deyəndə istifadə et.
---

# Prompt ilə əllə motion (Kısım 2)

Mənbə: kit səh. 9–11 ("Claude mu, ChatGPT mi?" videosundakı yol).

Bu yol Claude-un **Code** bölməsi istifadə edilmədikdə və ya ChatGPT ilə sınamaq istənəndə keçərlidir:
AI animasiyanın kodunu söhbətdə yazır, istifadəçi o kodu HyperFrames ilə videoya çevirir.
Claude Code daxilindəsənsə, eyni addımları özün icra et (kodu fayla yaz, check/render-i özün işlət).

## Lazım olanlar

| Nə | Qeyd |
|----|------|
| AI | Claude və ya ChatGPT. |
| Node.js | nodejs.org-dan güncel versiya. Mac və Windows-da adi proqram kimi qurulur. |
| HyperFrames | Ayrıca qurmaq lazım deyil, `npx` ilə özü yüklənir. |

**Komandaları harada yazmaq:** Mac: Cmd + Space → "Terminal" → Enter. Windows: Start → "PowerShell".
İlk komanda (hər şey hazırdırmı):
```bash
npx hyperframes doctor
```

## 1. Videonu və transkripti hazırla

1. Kameraya danış, kəsmələri et, videonu export et (məs. `video.mp4`).
2. Terminal-da videonun olduğu qovluğa keç və layihəni yarat — layihə qovluğu açılır və danışıq söz-söz mətnə çevrilir:
   ```bash
   npx hyperframes init motion-projem --video video.mp4 --model large-v3 --language tr
   ```
   `--language` videonun dilidir: Azərbaycan dili üçün `az`, ingilis `en`, rus `ru`.
3. `cd motion-projem` — yaranan transkriptə bax, xüsusi adları düzəlt (məs. "Cloud" → "Claude").

## 2. Prompt şablonu

Tam şablon: `templates/motion-prompt.md` (ingiliscə versiya + kitdəki orijinal türkcə mətn).
`[KVADRAT MÖTƏRİZƏLƏRİ]` videoya görə doldur, hamısını kopyala və AI-a yapışdır.
"Brand" bölməsinə `style-rules.md` qayda faylının məzmununu da əlavə edə bilərsən.

Claude Code daxilində bu şablonu **özünə tapşırıq** kimi istifadə et: transkripti oxu, qayda faylını
oxu, `index.html`-i birbaşa layihə qovluğuna yaz.

### Texniki qaydalar (pozulmamalı)

- Tək fayl: `index.html`.
- Kök element `<body>` daxilində birbaşa:
  `<div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-duration="[SÜRƏ]">`
  (Reels/TikTok üçün 9:16 lazımdırsa: `data-width="1080" data-height="1920"`.)
- Video: `<video id="video" class="clip" src="video.mp4" data-start="0" data-duration="[SÜRƏ]" data-track-index="0" muted playsinline></video>`
- Səs ayrıca: `<audio id="ses" class="clip" src="video.mp4" data-start="0" data-duration="[SÜRƏ]" data-track-index="1"></audio>`
- Zamanlanan hər element `class="clip"` və `data-start`, `data-duration`, `data-track-index` alır.
- Animasiya GSAP 3 ilə. **TƏK** `gsap.timeline({ paused: true })` qur və `window.__timelines["main"] = tl;` ilə qeyd et.
- Təsadüfilik (`Math.random`), `Date`, `setTimeout`, sonsuz təkrar yoxdur. Hər şey zamana görə deterministik.
- `.clip` elementlərinin görünürlüyünü tween etmə — içindəki uşaq elementi animasiya et.

## 3. Render və düzəliş

1. AI-ın verdiyi kodun tamamını layihə qovluğundakı `index.html`-ə yapışdır. Videonu `video.mp4` adı ilə və font faylını eyni qovluğa qoy.
2. Əvvəl yoxla, sonra brauzerdə izlə:
   ```bash
   npx hyperframes check
   npx hyperframes preview
   ```
3. Xəta çıxarsa, xəta mesajını olduğu kimi AI-a yapışdır, düzəltməsini istə. Bəyənmədiyin yeri cümlə ilə izah et: **"3-cü saniyədəki yazı üzümü örtür, sola çək."**
4. Bəyənəndə videonu çıxar:
   ```bash
   npx hyperframes render --fps 60 --output motion.mp4
   ```

## İki yolun fərqi

Söhbətdə (Kısım 2) kodu sən daşıyırsan, xətanı sən görüb geri yapışdırırsan.
Kısım 1-də (`video-kurgu` skill-i) Claude öz çıxışına baxıb xətaları özü düzəldir, kəsməni və altyazını da o edir.
Bir dəfə qurulandan sonra Kısım 1 çox daha sürətlidir.

## Qeyd

HyperFrames CLI-nin dəqiq parametrləri versiyaya görə dəyişə bilər. Komanda xəta verərsə,
`npx hyperframes --help` və `npx hyperframes <komanda> --help` ilə yoxla; parametr uydurma.

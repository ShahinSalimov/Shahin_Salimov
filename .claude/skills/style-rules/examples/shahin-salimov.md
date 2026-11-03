# Mənim üslubum — Şahin Səlimov

> Bu fayl hər videoda oxunur. Qısa və konkret. Hər düzəlişdən sonra yenilə.
> Versiya 1 — fərziyyələr təsdiqlənib. `[?]` işarəli sətirlər hələ doldurulmalıdır.

## Format
- Ölçü: 9:16, 1080x1920 (Instagram Reels, TikTok).
- FPS: 30. Mənbə video 60 fps-dirsə, 60 saxla.
- Müddət: sifarişə görə; tipik 20–60 san.
- Dil: Azərbaycan dili (Whisper: `--language az`).
- Danışan şəxs kadrın mərkəzində.

## Təhlükəsiz zona (Reels/TikTok UI)
- Yuxarı 250 px və aşağı 400 px-də heç bir mətn yoxdur (platformanın düymələri və başlığı orada olur).
- Sağ kənarda 150 px boş qalır (like/comment düymələri).

## Rənglər
- Zəmin (kartlar, panellər): #0A0A0A, 85% şəffaflıq.
- Yazı: #FFFFFF.
- Vurğu: #2D7CFF (elektrik mavi) — yalnız vacib sözdə, bir səhnədə 1–2 dəfə.
- Cəmi 3 rəng. Gradient yoxdur.

## Font
- Font: Montserrat (Azərbaycan hərflərini dəstəkləyir: ə ğ ı ö ş ç ü). Font faylı `references/`-də.
- Başlıq: ExtraBold (800).
- Altyazı: Bold (700).
- Hər yerdə eyni font. İkinci font yoxdur.

## Altyazı
- Yer: aşağı hissə, kadrın hündürlüyünün təxminən 68%-i (Reels UI-nin üstündə).
- Ölçü: 64–72 px, mərkəzə düzlənmiş.
- Bir dəfədə 2–3 söz.
- Vurğulanan söz: vurğu rəngi, digərləri ağ.
- Kölgə: yumşaq qara kölgə (oxunaqlıq üçün), kontur yoxdur.
- Hamısı kiçik hərf yox — cümlədəki kimi yazılır.
- Altyazı danışıqla söz-söz sinxron (Whisper word timestamps).

## Hərəkət
- Girişlər: sürətli və yumşaq, 0.25–0.35 san, `power3.out`.
- Çıxışlar: qısa, 0.15–0.2 san.
- Altyazı sözləri: kiçik scale-up (0.9 → 1.0) + fade.
- Keçidlər: sadə cut; nadir hallarda qısa zoom-punch (1.0 → 1.08).
- Kəsmə ritmi: səssiz yerlər kəsilir, nəfəs üçün 0.1–0.15 san saxlanılır.
- Eyni cümlə bir neçə dəfə deyilibsə, sonuncu saxlanılır.

## Üz
- Danışan şəxsin üzünü heç vaxt örtmə.
- Qrafika və kartlar yalnız yuxarı üçdə birdə və ya üzün yanında görünür.
- Zoom üzü kadrdan çıxarmamalıdır.

## Səs
- Səs effektləri: yalnız qrafika girişlərində yüngül "whoosh" / "pop", danışıqdan −18 dB aşağı.
- Musiqi: yoxdur (və ya çox aşağı səviyyədə fon, danışıqdan −24 dB).
- Danışıq səsi normallaşdırılır (−14 LUFS).

## Qadağalar
- Emoji yoxdur.
- 3 rəngdən çox rəng yoxdur.
- Üzün üstünə yazı və ya qrafika yoxdur.
- Hər sözü vurğulamaq yoxdur — yalnız vacib sözlər.
- Neon, glitch, RGB split effektləri yoxdur.
- Ucuz stok keçidləri (spin, star wipe) yoxdur.
- Ekranda 6 sözdən uzun mətn bloku yoxdur.

## Xüsusi adlar (Whisper düzəlişləri)
- Claude (yox: Cloud, Klod)
- ChatGPT
- OpenAI
- n8n
- Şahin Səlimov
- Pinterest
- [?] öz brend / şirkət adların

## Referanslar
- [?] <link> — bunun altyazısı
- [?] <link> — bunun rəngləri
- [?] <link> — bunun motion-ları

## Düzəliş tarixçəsi
- v1: ilk variant; vurğu rəngi, font və səs qaydaları təsdiqləndi.

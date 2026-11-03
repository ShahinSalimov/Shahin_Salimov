---
name: style-rules
description: İstifadəçinin video üslubunu Claude-a öyrədən qayda faylını (style-rules.md / kural dosyası) yaratmaq, doldurmaq və hər videodan sonra yeniləmək. Referans video linklərini (YouTube, Instagram, TikTok) incələyib rəng, font, altyazı ölçüsü/yeri, animasiya sürəti, keçidlərdən qayda çıxarır. İstifadəçi "üslubumu öyrən", "qayda faylı yaz", "kural dosyası", "bu videoların tərzini incələ", "bunu qayda faylına əlavə et, bir daha etmə" deyəndə istifadə et.
---

# Üslubu öyrət — qayda faylı (Kısım 1, Addım 3 — ən vacib addım)

Mənbə: kit səh. 5–6.

## Niyə vacibdir

Üslub öyrədilməsə Claude **hamınınkı kimi video** çıxarır. AI həmişə ən proqnozlaşdırıla bilən
nəticəni verir; hamı eyni şeyi istəsə, hamının videosu bir-birinə bənzəyir.
Üslub bir dəfə öyrədilir, Claude onu **qayda faylına** (`style-rules.md`) yazır və bundan sonra
hər videoda o fayla baxır.

Fayl iş qovluğunun kökündə saxlanılır: `style-rules.md`. Boş şablon: `templates/style-rules.md`.

## Rejim A — Referans videolardan qayda çıxarmaq

İstifadəçi 3–5 bəyəndiyi videonun linkini verir. Orijinal mesaj:
> Bu videoların tarzını incele: renkler, font, yazıların boyu ve yeri, animasyonların hızı, geçişler.
> Bunlardan bir kural dosyası yaz ve bundan sonraki her videoda buna uy. [linkler]

İstifadəçiyə məsləhət: hər linkin altına nəyini bəyəndiyini bir cümlə ilə yazsın
("bunun altyazısı", "bunun rəngləri") — Claude nəyə baxacağını belə anlayır.

İş axını:
1. Videoları `references/` qovluğuna yüklə (yalnız analiz üçün):
   ```bash
   yt-dlp -f "bv*[height<=1080]+ba/b" -o "references/%(id)s.%(ext)s" "<URL>"
   ```
2. Hər videodan kadrlar çıxar və onlara bax (rəng, font, altyazı yeri/ölçüsü):
   ```bash
   ffmpeg -i references/<id>.mp4 -vf "fps=1/2,scale=540:-1" references/<id>_%03d.jpg
   ```
3. Hərəkət sürəti / keçidlər üçün səhnə dəyişmələrini tap:
   ```bash
   ffmpeg -i references/<id>.mp4 -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep pts_time
   ```
4. Lazım olsa Whisper ilə altyazı ritmini (bir dəfədə neçə söz) ölç.
5. Tapıntıları şablonun başlıqlarına görə `style-rules.md`-ə yaz. Əmin olmadığın başlıqları
   uydurma — istifadəçidən soruş.
6. Referans videoları istifadəçinin öz videosunda istifadə etmə; yalnız analiz.

Link vermək şərt deyil — istifadəçi öz cümlələri ilə də təsvir edə bilər.

## Rejim B — Öz cümlələrindən qayda yazmaq

İstifadəçi montajçıya deyirmiş kimi danışır, sən qısa, konkret qaydaya çevirirsən:

| İstifadəçi deyir | Qayda faylına belə girir |
|------------------|--------------------------|
| "Bu fontu bəyənirəm." | Font: tək font, hər yerdə eyni. |
| "Bu rəngi istifadə edə bilərsən." | Vurğu rəngi: tək rəng, yalnız vacib sözdə. |
| "Üzümün üstünə bir şey gəlməsin." | Danışan şəxsin üzünü örtmə. |

## Rejim C — Hər videodan sonra yeniləmə

Bəyənilməyən bir şey düzəldiləndən sonra istifadəçi "bunu qayda faylına əlavə et, bir daha etmə" deyir.
Eyni şey **ikinci dəfə** düzəldilirsə, istifadəçi deməsə də qayda kimi əlavə etməyi təklif et.
Fayl böyüdükcə revizyon azalır.

## Yaxşı qayda faylının prinsipləri

- **Az rəng:** 2–3 rəng, tək font. Həmişə eyni olsun ki, izləyici səni rəngindən tanısın.
- **Qadağalar siyahısı:** heç istəmədiklərin (emoji, çox rəng, üzün üstünə yazı...). Bu siyahı istədiklərindən də çox iş görür.
- **Xüsusi adlar:** Whisper adları qarışdıra bilər — düzgün yazılışları (brend adları, istifadəçinin adı, "Claude") faylda saxla.
- Başqasının qayda faylını köçürmə — o, onun üslubudur. Hər kəsin öz faylı lazımdır.

## Şablonun başlıqları

Renkler / Font / Altyazı / Hareket / Yüz / Ses / Yasaklar / Referanslar →
`templates/style-rules.md`-də: Rənglər, Font, Altyazı, Hərəkət, Üz, Səs, Qadağalar, Xüsusi adlar, Referanslar.

İstifadəçi "bu başlıqlara görə doldur, əmin olmadıqlarını mənə soruş" deyə bilər — onda boşluqları
doldur və hər qeyri-müəyyən başlıq üçün qısa sual ver.

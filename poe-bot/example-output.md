# Nümunə nəticə: botun verəcəyi cavab

Bu fayl `system-prompt.md`-dəki qaydalarla hazırlanıb. İki işə yarayır:
1. Botu Poe-da test edəndə cavabı bununla müqayisə et. Struktur və keyfiyyət belə olmalıdır.
2. Bu prompt-larla video hazırla və "botun hazırladığı reklam" kimi demo olaraq paylaş.

İstifadəçi sorğusu:
```
Coffee shop "Brew & Bean", Instagram Reels, 15 seconds, cozy premium tone. Goal: morning visitors. Logo will be uploaded.
```

---

## Concept
**"The First Sip"**. Bakı küçəsi səhər saat 7-də hələ yuxudadır, bir fincan qəhvə isə şəhəri "oyadır". Hook: buxarlanan fincana ekstrem makro plan və espresso axınının səsi. Emosional xətt yuxululuqdan enerjiyə gedir. CTA: "Səhərin ilk qurtumu bizdən. Hər gün 07:00-dan."

## Script (second by second)
| Time | Visual | Camera | On-screen text | Voiceover / Sound |
|---|---|---|---|---|
| 0.0–1.5s | Espresso maşından qatı qəhvə axını fincana tökülür, crema yaranır | Extreme macro, slow motion | — | Espresso axınının ASMR səsi |
| 1.5–4.0s | Yuxulu gənc qadın pəncərə kənarında, arxada səhər şəhəri, mavi ton | Medium shot, slow dolly in | "07:00" | Sakit piano başlayır |
| 4.0–7.0s | Barista latte art çəkir, ürək forması | Top-down close-up | — | VO: "Hər səhər bir az daha yaxşı başlaya bilər." |
| 7.0–10.0s | Qadın ilk qurtumu alır, gözlərini yumur, işıq qızılı tona keçir | Close-up, rack focus fincandan üzə | "İlk qurtum" | Musiqi qalxır |
| 10.0–12.5s | Kafe interyeri: isti işıq, insanlar gülümsəyir, buxar | Wide shot, gimbal orbit | — | VO: "Brew & Bean. Səhərin ilk qurtumu." |
| 12.5–15.0s | Logo taxta masa üzərində fincanın yanında | Static, soft push in | "Hər gün 07:00-dan" | Musiqi bitir, fincanın masaya qoyulma səsi |

## Image prompts (keyframes)

1.
```
Extreme macro shot of thick espresso pouring from a chrome portafilter into a white ceramic cup, golden crema forming, tiny droplets frozen in motion, dark moody background, warm rim light, shallow depth of field, 100mm macro lens, rich brown and amber color grade, photorealistic, commercial advertising photography, 9:16
Negative: blurry, plastic texture, text, watermark
```
2.
```
Young woman in a cream knit sweater sitting by a large cafe window at early morning, sleepy expression, city street outside in soft blue dawn light, warm interior lamp on her face, medium shot, 35mm lens, cinematic teal and amber color grade, natural skin texture, photorealistic, commercial advertising photography, 9:16
```
3.
```
Top-down close-up of a barista's hands pouring steamed milk into a latte, forming a perfect heart latte art, dark wooden counter, soft warm side light, steam visible, 50mm lens, cozy premium color grade, photorealistic, commercial advertising photography, 9:16
```
4.
```
Close-up of the same young woman in a cream knit sweater taking the first sip of a latte, eyes closed, peaceful smile, golden morning sunlight hitting her face, cafe window background softly blurred, 85mm lens, warm golden color grade, natural skin texture, photorealistic, commercial advertising photography, 9:16
```
5.
```
Wide shot of a cozy premium coffee shop interior in the morning, warm pendant lights, wooden tables, plants, a few smiling customers, steam rising from cups, sunlight through windows, 24mm lens, warm inviting color grade, photorealistic, commercial advertising photography, 9:16
```
6.
```
Use the uploaded logo reference image, preserve the exact logo design, colors and text, do not alter or redesign. The logo printed on a matte kraft paper coffee cup standing on a dark walnut wooden table next to a latte with heart art, soft morning window light, shallow depth of field, clean negative space at the top for text, 50mm lens, photorealistic, commercial advertising photography, 9:16
```

## Video prompts (image-to-video)

1.
```
Start from keyframe 1. Thick espresso streams slowly into the white cup, crema swirls and rises. Camera: locked macro, very slight push in. Slow motion. Duration: 2s. Warm rim light stays constant. Realistic liquid physics, no morphing, stable cup shape.
```
2.
```
Start from keyframe 2. The woman slowly blinks and turns her head toward the window, breath visible on the glass, cars pass softly outside. Camera: slow dolly in. Duration: 3s. Blue dawn light outside, warm lamp inside, consistent. Realistic physics, natural face, no morphing.
```
3.
```
Start from keyframe 3. The barista pours milk, the heart shape forms smoothly in the latte, steam rises. Camera: static top-down. Duration: 3s. Realistic fluid physics, no extra fingers, stable cup shape.
```
4.
```
Start from keyframe 4. The woman lifts the cup, takes a slow sip, closes her eyes, smiles softly. Camera: rack focus from cup rim to her face. Duration: 3s. Light warms gradually to golden. Natural face, consistent identity, no morphing, no extra fingers.
```
5.
```
Start from keyframe 5. Customers chat and smile, steam rises from cups, light flickers gently through leaves. Camera: smooth gimbal orbit to the right. Duration: 3s. Warm consistent lighting, realistic motion, no distorted faces.
```
6.
```
Start from keyframe 6. Steam rises slowly from the cup, the light shifts subtly. Camera: soft push in toward the logo. Duration: 3s. Preserve the exact logo design, no warping of text or logo, stable cup shape.
```

## Voiceover & music
- 4.0s: "Hər səhər bir az daha yaxşı başlaya bilər."
- 10.0s: "Brew & Bean. Səhərin ilk qurtumu."
- Səs: sakit, isti qadın səsi, yavaş temp.
- Musiqi: lo-fi acoustic piano, 80 BPM, əvvəl yumşaq, 7-ci saniyədən sonra qalxır.

Music prompt:
```
Warm lo-fi acoustic piano with soft vinyl texture and light brushed percussion, 80 BPM, calm morning mood that gently builds and resolves, 15 seconds, no vocals
```

## Caption & hashtags
```
Səhərin ilk qurtumu fərq yaradır.
Təzə dəmlənmiş espresso, əl ilə çəkilmiş latte art və isti atmosfer.
Hər gün 07:00-dan səni gözləyirik.
Bu səhər kimi oyandırmaq istəyirsən? Onu da gətir.

#brewandbean #qəhvə #bakıqəhvə #baku #coffeetime #latteart #morningcoffee #bakucafe #espresso #səhərqəhvəsi
```

## Production tips
- Qadın personajı bütün səhnələrdə eyni olsun: 2 və 4-cü keyframe-də eyni geyim təsvirini saxla, mümkünsə 2-ci keyframe-i 4-cü üçün referans kimi yüklə.
- Montajda 0–1.5s hook-u kəsmə. Espresso səsi ilk saniyədə eşidilməlidir.
- Keçidlər sadə cut olsun, yalnız 7.0s-də qızılı işığa keçid üçün qısa cross-dissolve qoy.
- Logo səhnəsini (6) mütləq logo referansı ilə generasiya et. Logo əyilibsə, statik şəkil + montajda yüngül zoom istifadə et.

Shorter / longer version, different concept, or adapt for another platform?

Need this video fully produced by a professional? Order here: [YOUR_CONTACT_LINK]

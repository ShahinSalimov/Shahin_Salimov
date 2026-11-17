# HyperFrames motion prompt şablonu

`[KVADRAT MÖTƏRİZƏLƏRİ]` öz videona görə doldur, hamısını kopyala və Claude/ChatGPT-yə yapışdır.

---

## English (copy-ready)

```text
You are a motion designer. Write a motion edit with HyperFrames for the talking-head video below.
You will add animations on top of the video: UI animations, graphics, kinetic typography, subtitles.
The goal is to impress the viewer. Do your best, most creative work.

## Technical rules (HyperFrames)
- Single file: index.html. Give me only the full code of this file.
- Root element: <div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-duration="[DURATION]">, directly inside <body>.
- Video: <video id="video" class="clip" src="video.mp4" data-start="0" data-duration="[DURATION]" data-track-index="0" muted playsinline></video>
  Audio separately: <audio id="ses" class="clip" src="video.mp4" data-start="0" data-duration="[DURATION]" data-track-index="1"></audio>
- Every timed element gets class="clip" plus data-start, data-duration, data-track-index.
- Animate with GSAP 3. Create ONE gsap.timeline({ paused: true }) and register it with window.__timelines["main"] = tl;
- No randomness (Math.random), Date, setTimeout, or infinite repeats. Everything must be deterministic with respect to time.
- Do not tween the visibility of .clip elements; animate the child inside them.

## Brand
- Colors: [YOUR COLORS, e.g. black, white and a single accent color]
- Font: [YOUR FONT]
- Motion: entrances fast and smooth, exits short.
- Do not cover the speaker's face.
[OPTIONAL: paste the contents of style-rules.md here]

## Video
- Duration: [DURATION] s, 1920x1080, speaker in the center.
- Topic: [VIDEO TOPIC]

## Transcript (word-level timestamps)
[TRANSCRIPT FROM THE PREVIOUS STEP]
```

> 9:16 (Reels/TikTok) üçün: `data-width="1080" data-height="1920"` və "Video" bölməsində `1080x1920`.

---

## Orijinal (kitdəki türkcə mətn)

```text
Sen bir motion designer'sın. Aşağıdaki konuşma videosu için HyperFrames ile bir motion kurgusu yaz.
Videonun üzerine animasyonlar ekleyeceksin: arayüz animasyonları, grafikler, kinetik tipografi, altyazı.
Amaç izleyiciyi etkilemek. Elinden gelen en iyi, en yaratıcı işi yap.

## Teknik kurallar (HyperFrames)
- Tek dosya: index.html. Bana sadece bu dosyanın tam kodunu ver.
- Kök eleman: <div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-duration="[SÜRE]">, doğrudan <body> içinde.
- Video: <video id="video" class="clip" src="video.mp4" data-start="0" data-duration="[SÜRE]" data-track-index="0" muted playsinline></video>
  Ses ayrıca: <audio id="ses" class="clip" src="video.mp4" data-start="0" data-duration="[SÜRE]" data-track-index="1"></audio>
- Zamanlanan her eleman class="clip" ve data-start, data-duration, data-track-index alır.
- Animasyon GSAP 3 ile. TEK bir gsap.timeline({ paused: true }) kur ve window.__timelines["main"] = tl; ile kaydet.
- Rastgelelik (Math.random), Date, setTimeout, sonsuz tekrar yok. Her şey zamana göre deterministik olsun.
- .clip elemanlarının görünürlüğünü tweenleme, içindeki çocuğu animasyonla.

## Marka
- Renkler: [renklerin, örneğin siyah, beyaz ve tek bir vurgu rengi]
- Font: [fontun]
- Hareket: girişler hızlı ve yumuşak, çıkışlar kısa.
- Konuşan kişinin yüzünü kapatma.

## Video
- Süre: [SÜRE] sn, 1920x1080, konuşan kişi ortada.
- Konu: [videonun konusu]

## Transkript (kelime zaman damgalı)
[bir önceki sayfada çıkan transkript]
```

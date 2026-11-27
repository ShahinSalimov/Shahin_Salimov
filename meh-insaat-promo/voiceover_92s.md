# MEH-İnşaat — hazır video üçün səsləndirmə və musiqi (92.4 san)

Video: 478x850, 24 fps, 92.4 san, səssiz. Kəsimlər ffmpeg scene detection ilə ölçülüb və kadr-kadr yoxlanılıb.
Qayda: hər cümlə öz səhnəsi başlayandan 0.2–0.5 san sonra başlayır və səhnə bitməmişdən ən azı 0.4 san əvvəl bitir. Temp: saniyədə təxminən 2 söz.

## Səhnə xəritəsi və səsləndirmə

| # | Video (san) | Kadrda nə var | Səs başlayır | Mətn | Təxmini müddət |
|---|---|---|---|---|---|
| 1 | 0.0–13.0 | Karandaşla eskiz → mavi plan → akvarel 3D eskiz → qızılı işıqlanan ev kəsiyi | 0.4 | Hər böyük layihə bir eskizdən başlayır. Planlaşdırma, layihələndirmə və dizayn — evinizin hər detalı əvvəlcədən düşünülür. | ~9.5 |
| 2 | 13.0–18.0 | Gündoğanda boş torpaq, narıncı xətlər | 13.4 | Boş torpaq üzərində ilk xətlər çəkilir. | ~3 |
| 3 | 18.0–23.0 | Ekskavator təməl qazır | 18.4 | Torpaq işləri və təməl qazıntısı. | ~3 |
| 4 | 23.0–29.0 | Mikserdən qəlibə beton tökülür | 23.4 | Möhkəm təməl — ağır texnika ilə beton tökülməsi. | ~4 |
| 5 | 29.0–36.2 | Divar hörülür, split-screen, dam karkası | 29.4 | Divarların hörülməsindən dam örtüyünə qədər — bir, iki və üç mərtəbəli evlər. | ~5.5 |
| 6 | 36.2–40.0 | Kafel, suvaq, rəng | 36.5 | Daxili təmir və bəzək işləri. | ~2.5 |
| 7 | 40.0–48.5 | Elektrik lövhəsi, rozetka, tavan lampası yanır | 40.4 | Elektrik təchizatı: elektrik lövhələri, rozetkalar və işıqlandırma — tam təhlükəsizliklə. | ~6.5 |
| 8 | 48.5–57.4 | Havalandırma kanalları, komanda, kanal içi | 48.9 | Havalandırma sistemlərinin layihələndirilməsi və quraşdırılması — yaşayış və kommersiya obyektlərində. | ~7 |
| 9 | 57.4–61.5 | Kondisionerdən soyuq hava çıxır | 57.7 | Kondisionerlərin peşəkar quraşdırılması. | ~2.8 |
| 10 | 61.5–71.5 | Asfalt döşənir, katok sıxlaşdırır | 61.9 | Yol və asfalt işləri — dəqiq, möhkəm və uzunömürlü. | ~4.5 |
| 11 | 71.5–81.5 | Dirək bərkidilir, lampa bağlanır və yanır | 71.9 | Küçə və park işıqlandırması: dirəyin quraşdırılmasından lampanın yanmasına qədər. | ~6.5 |
| 12 | 81.5–86.4 | Komanda hazır evin qarşısında | 81.9 | Peşəkar komanda. Vaxtında və keyfiyyətli təhvil. | ~3.5 |
| 13 | 86.4–92.4 | Logo yaranır | 87.0 | MEH-İnşaat MMC. Təmir və tikinti xidmətləri. | ~4 |
| 14* | 92.4–96.4 | (əlavə) son kadr + nömrə | 92.6 | Zəng edin: sıfır yetmiş, yeddi yüz on bir, iyirmi iki, əlli dörd. | ~3.5 |

\* Videoda əlaqə nömrəsi yoxdur. Son kadrı CapCut-da 4 saniyə uzat (freeze frame), altına `070 711 22 54` yaz və 14-cü cümləni qoy.

## ElevenLabs
- Hər sətri ayrıca generasiya et, "Səs başlayır" sütunundakı saniyəyə qoy. Belə olanda səsləndirmə səhnə keçidlərindən qabağa düşmür və gecikmir.
- Model: Eleven v3. Tələffüz zəif olsa, Multilingual model ilə müqayisə et.
- Voice Design:
```
A confident, warm, deep adult male voice in his late 30s, native Azerbaijani speaker, calm and trustworthy corporate tone, clear diction, medium-slow pace, premium commercial narrator, studio quality, no background noise.
```
- Stability 50% · Similarity 75% · Style 25% · Speaker Boost on · Speed 0.95
- Bir sətir "Təxmini müddət" sütunundakı vaxtdan 0.5 saniyədən çox uzun çıxsa, həmin sətri Speed 1.0 ilə yenidən generasiya et.
- "MEH" sözü səhv oxunarsa, mətndə "Meh İnşaat" kimi yaz.

## Musiqi (ElevenLabs Music / Suno)
```
Instrumental cinematic corporate background music for a construction company commercial, 96 seconds, 96 BPM, key of D minor resolving to F major. 0-13s: soft felt piano and airy strings, calm and inspiring, like an architect drawing. 13-29s: low pulsing synth bass and light ticking percussion enter, building energy as machines start working. 29-61s: full rhythmic layer, warm strings, steady driving drums, modern and confident, subtle swells on scene changes. 61-81s: bigger and brighter, wider strings, more momentum. 81-86s: short uplifting rise. 86-92s: soft impact hit at 86.5s, shimmering gold-like synth pad and piano motif for the logo reveal. 92-96s: gentle resolved ending, last note fades out. No vocals, no lyrics, no drops, premium and clean.
```

## Mix (CapCut)
- Səsləndirmə: 0 dB (pik −3 dB).
- Musiqi səs olan yerlərdə −18 dB, səsin olmadığı aralıqlarda −10 dB (ducking / auto-volume).
- 86.4 saniyədə logo üçün musiqidə impact. Lazım olsa, ayrıca "whoosh + impact" səs effekti əlavə et.
- Musiqinin son 1.5 saniyəsi fade out.

## Videoda gördüyüm qeydlər
- 86.4–92.4, logo: AI dairənin ətrafına qızılı halqa əlavə edib, orijinal logoda bu halqa yoxdur. Tünd göy "MEH-İNŞAAT MMC" yazısı da qara fonda çətin oxunur. Logonu dəyişdirməmək şərtinə görə son 3 saniyənin üstünə orijinal `outro/layers/logo_full_transparent.png` faylını overlay etmək, ya da hazır outro klipinin son kadrını qoymaq tövsiyə olunur.
- 29–32 san: divar daşları açıq-boz bloklardır. Ağ daş istəmədiyini demişdin. Bu kadr qısa olduğu üçün kritik deyil, amma diqqət et.

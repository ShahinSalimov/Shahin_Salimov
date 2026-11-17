# Supercar Crash YouTube Manager

Lüks avtomobil, supercar və hypercar-ların divara çırpılmasını göstərən AI simulyasiya kanalı üçün idarəetmə sistemi. Hər gün **1 uzun video (8:30) + 1 Short (30 san)** planlaşdırır, hər video üçün başlıq, description, tag, pinned comment, AI video prompt-larını (saniyə-saniyə) və thumbnail prompt-unu hazırlayır, hazır videonu YouTube-a **private** yükləyir. Sən Studio-da public edirsən. 1000 abunəçi hədəfini dashboard-da izləyir.

## İş axını (hər gün)

```
Sistem (avtomatik)                         Sən
──────────────────                         ──
14 gün qabaqcadan plan + metadata + prompt
                                           1. Dashboard-da günün videosunu aç, prompt-ları kopyala
                                           2. Videonu AI alətində yarat, montaj et
                                           3. Faylı dashboard-dan yüklə (və ya inbox/2026-11-18-L.mp4)
Faylı tapır, YouTube-a private yükləyir,
thumbnail qoyur, playlist-ə əlavə edir
                                           4. Panelə bax: "Public etməli olduğun videolar"
                                              Studio-da aç → Public → "Public etdim"
Abunəçi sayını yeniləyir, hədəfə qədər ETA
```

Fayl adları: uzun video `YYYY-MM-DD-L.mp4`, Short `YYYY-MM-DD-S.mp4`, thumbnail `YYYY-MM-DD-L.jpg`.

## Quraşdırma

```bash
cd supercar-crash-yt
pip install -r requirements.txt
cp .env.example .env          # sonra .env-i doldur
python cli.py plan --days 30  # ilk 30 günü planla
python cli.py serve           # dashboard: http://localhost:8080
python cli.py worker          # gündəlik işi hər 3 saatdan bir işlədir (ayrı terminalda)
```

`worker` əvəzinə cron da olar: `0 */3 * * * cd /path/supercar-crash-yt && python cli.py daily`.
Sistem videoların olduğu kompüterdə (və ya faylları dashboard-dan qəbul edən serverdə) işləməlidir.

### YouTube API açarları (bir dəfə)

1. [Google Cloud Console](https://console.cloud.google.com) → yeni layihə → **YouTube Data API v3**-ü aktiv et.
2. **OAuth consent screen**: External, öz email-ini "Test users"-ə əlavə et.
3. **Credentials → Create OAuth client ID → Desktop app**. Client ID və Secret-i `.env`-ə yaz.
4. Öz kompüterində: `python scripts/get_refresh_token.py <CLIENT_ID> <CLIENT_SECRET>`. Brauzerdə kanalın sahibi olan hesabla daxil ol, kanalı seç. Çıxan `YT_REFRESH_TOKEN`-i `.env`-ə yaz.
5. Qeyd: consent screen "Testing" statusunda qalanda Google refresh token-i 7 gündən sonra ləğv edə bilər. Bunun qarşısını almaq üçün consent screen-i "In production" et.

### Vacib: private yükləmə və Google audit

Google-un sənədlərinə görə audit keçməmiş API layihəsindən yüklənən videolar **private rejimə məhdudlaşdırılır**. Sənin planın (sistem private yükləyir, sən public edirsən) buna uyğundur, amma bu məhdudiyyətin Studio-da əl ilə public etməyə də mane olub-olmadığını dəqiq bilmirəm. **İlk gün bir test videosu yüklə və Studio-da public etməyə çalış.** "Locked" görsənsə, [YouTube API audit formunu](https://support.google.com/youtube/contact/yt_api_form) doldur; o vaxta qədər `.env`-də `UPLOAD_MODE=manual` qoy: dashboard hər şeyi kopyala-yapışdır şəklində verəcək.

Kvota: gündə 10 000 unit. Yükləmə ~1600, thumbnail 50, playlist 50 → gündə 2 video rahat sığır.

### Claude ilə başlıq təkmilləşdirmə (istəyə bağlı)

`.env`-də `ANTHROPIC_API_KEY` olanda sistem hər video üçün Claude-dan 3 başlıq variantı, description hook-u və pinned comment alır. Nəticə eyni qaydalardan keçir (100 simvol, "real footage" kimi aldadıcı ifadələr qadağan). Claude cavab verməsə şablon metadata qalır. Server-side fallback aktivdir: model sorğunu rədd etsə, API onu başqa modelə ötürür; istəmirsənsə `scc/llm.py`-dan `fallbacks` sətrini sil.

## Kontent strategiyası (0 → 1000 abunəçi)

| Faza | Günlər | Uzun video formatları | Məqsəd |
|---|---|---|---|
| Launch | 1–21 | Showdown (Chiron vs Jesko), Speed Ladder (50→300 km/h) | Ən çox axtarılan adlarla ilk izləyicilər |
| Growth | 22–60 | + Price Ladder ($110K vs $3M), Brand Battle, SUV Tank | Seriyalar, playlist-lər, təkrar baxış |
| Scale | 61+ | + Top 5 siyahılar, daha geniş maşın hovuzu | Watch time, tövsiyələrə düşmək |

Short-lar: cüt günlər o günün uzun videosunun teaser-i (ən bahalı maşın, description-da uzun videonun linki), tək günlər ayrıca maşın. Formatlar: one hit, 1000 FPS slow-mo, "Will it survive?", before/after, A vs B.

Planlaşdırıcının qaydaları:
- eyni uzun format ardıcıl iki gün təkrarlanmır;
- maşın 4 gün ərzində təkrar çıxmır, uzun videoda 10 gün ərzində təkrar çıxmamağa çalışır;
- ilk 2 fazada viral adlar (Chiron, Jesko, Senna, Revuelto, G63, Cullinan...) daha tez-tez seçilir.

Abunəçi artımı üçün sistemin hər videoya qoyduğu elementlər:
- description-un ilk sətri: başlıq + şərhə çağıran sual;
- pinned comment: "növbəti maşını sən seç" (şərh = engagement = tövsiyə);
- uzun videoda fəsillər (chapters), hər raunddan sonra "damage score" (videonun sonuna qədər saxlayır);
- Short-un sonu ilk kadrla birləşir (loop), ilk saniyədə zərbə;
- playlist-lər avtomatik yaranır (Speed Ladder Crash Tests, Supercar Showdowns və s.).

Yayım vaxtları `.env`-dədir: uzun 16:00 UTC (Bakı 20:00), Short 22:00 UTC (Bakı 02:00, New York 17:00). Bu bir fərziyyədir: 2–3 həftədən sonra YouTube Studio → Analytics → "When your viewers are on YouTube" bölməsinə baxıb dəyiş.

## Siyasət və risklər

- **AI açıqlaması**: hər yükləmədə `containsSyntheticMedia=true` (YouTube-un "altered or synthetic content" etiketi) qoyulur, description-da "AI-generated simulation, not real footage" yazılır. Videonun küncündə "AI SIMULATION" yazısı da tövsiyə olunur.
- **Aldadıcı başlıq qadağası**: "real footage", "caught on camera", "dashcam", ölüm/yaralanma sözləri başlıqda və description-da bloklanır. Prompt-larda insan, sürücü və yaralanma yoxdur.
- **Monetizasiya**: YouTube "inauthentic / mass-produced" məzmunu YPP-dən çıxara bilər. Ona görə eyni şablonu robot kimi təkrarlamaq yox, hər videoda öz səsin (voiceover), damage score, montaj və formatların dəyişməsi vacibdir.
- **Brendlər**: maşın adları yalnız identifikasiya üçündür (description-da disclaimer var). Rəsmi loqoları thumbnail-da böyük göstərmə.
- **Qiymətlər** `scc/catalog.py`-da təxminidir; vacib başlıqda istifadə etməzdən əvvəl yoxla.

## Fayllar

| Fayl | Nə edir |
|---|---|
| `scc/catalog.py` | 33 maşın, ssenarilər, kamera bucaqları, 11 format və başlıq şablonları, qadağan ifadələr |
| `scc/planner.py` | Gündəlik plan (1 uzun + 1 Short), təkrar qaydaları, fazalar |
| `scc/prompts.py` | Saniyə-saniyə klip prompt-ları, voiceover, thumbnail prompt, montaj qeydləri |
| `scc/metadata.py` | Başlıq, description (chapters + AI açıqlaması), tag (≤500 simvol), hashtag, pinned comment |
| `scc/llm.py` | İstəyə bağlı Claude təkmilləşdirməsi |
| `scc/youtube.py` | OAuth, resumable upload, thumbnail, playlist, kanal statistikası, kvota |
| `scc/service.py` | Gündəlik iş: plan, inbox, yükləmə, status, statistika, export |
| `app.py`, `templates/` | Dashboard (Azərbaycan dilində) |
| `cli.py` | Komandalar: `plan`, `daily`, `worker`, `upload`, `published`, `export`, `calendar`, `stats`, `serve` |

Testlər: `python -m pytest -q`

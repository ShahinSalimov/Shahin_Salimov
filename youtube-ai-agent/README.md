# SALIMOFF AI YOUTUBE

YouTube kanallarını sıfırdan quran və idarə edən sistem. Sistem bazarı analiz edir, niş seçir, kanalı qurur, long və Shorts videoları hazırlayır, onları YouTube-a planlı yükləyir və hər 3 gündən bir inkişaf hesabatı yazır. Hesabatdan çıxan nəticələr növbəti videoların planına daxil olur.

```
1. Analiz     → AI namizəd nişlər təklif edir. Hər niş üçün son 90 günün real YouTube datası yığılır:
                median baxış, kiçik kanalların uğuru (views/subs), yeni kanalların payı, rəqabət, Shorts payı.
2. Qərar      → şəffaf formula: Tələb 22% · Kiçik kanal uğuru 24% · Rəqabət 14% · RPM 16% · AI ilə istehsal 12% ·
                Monetizasiya təhlükəsizliyi 12%. Qalib niş səbəbi ilə birlikdə göstərilir, istəsəniz başqasını seçə bilərsiniz.
                Qalib nişin outlier videolarından başlıq formulları, hook-lar, thumbnail ideyaları, ideal uzunluq çıxarılır.
3. Kanal      → 5 ad variantı, handle, About mətni, açar sözlər, pillar-lar, ton, səs istiqaməti, vizual stil,
                loqo və banner, monetizasiya planı. Avtomatik yaradılanlar: Kitabxanada stil,
                "<Kanal> · Long" (16:9) və "<Kanal> · Shorts" (9:16, yandırılmış altyazı) profilləri.
4. Plan       → AI long və Shorts ideyaları yazır. Prioritet = AI proqnozu × pillar çəkisi (hesabatlardan gəlir).
5. İstehsal   → mövcud pipeline: ssenari → səhnələr → şəkillər → səs → montaj → metadata → thumbnail.
6. Upload     → növbəti boş slot (həftədə N long / N Shorts, saat qurşağı Asia/Baku), publishAt, thumbnail,
                "altered/synthetic content" işarəsi (containsSyntheticMedia).
7. Hesabat    → hər 3 gün: baxış, izlənmə saatı, abunəçi, AVD, long və Shorts müqayisəsi, pillar-ların göstəriciləri,
                YPP-yə qədər qalan təxmini gün sayı, AI tövsiyələri. Nəticələr "öyrənilənlər" siyahısına və
                pillar çəkilərinə yazılır, tam avtomatik rejimdə həftəlik tezlik də dəyişdirilir.
```

## Başlamaq

1. `start.bat` (Windows) və ya `./start.sh` (Mac/Linux). Brauzerdə http://127.0.0.1:8765 açılır.
2. **Sistem ayarları** bölməsində Demo rejimi açıq olanda bütün sistem pulsuz və API-siz sınanır.
3. **Yeni kanal** bölməsində dili, regionu və maraq sahələrini yazıb **Hamısını sistem etsin** düyməsini basın.
4. Kanal səhifəsi → **Brend və strategiya** → checklist. YouTube-da kanalı açın: ad, avatar və telefon təsdiqi API ilə edilmir.
5. **Autopilot və YouTube** → **YouTube-a qoş**. Bundan sonra **Brendinqi YouTube-a yaz** basın.

### Autopilot rejimləri
| Rejim | Nə edir |
|---|---|
| Təsdiqlə (tövsiyə) | Sistem plan qurur. İstehsala yalnız sizin təsdiqlədiyiniz ideyalar gedir, yükləmə və hesabat avtomatikdir |
| Tam avtomatik | İdeya seçimi, istehsal, yükləmə və hesabat tam avtomatikdir. Uğursuz istehsal bir dəfə təkrarlanır |

Qoruyucu limitlər: gündəlik büdcə (default $10), eyni anda 1 istehsal, hazır video buferi (2 long, 4 Shorts).

## Telefon versiyası

İnterfeys telefona uyğunlaşır. Telefondan idarə etmək üçün:
1. Kompüterdə `start-phone.bat` (Windows) və ya `./start-phone.sh` faylını işə salın.
2. Pəncərədə ünvan (məs. `http://192.168.1.25:8765`) və 6 rəqəmli PIN çıxır. Telefon eyni Wi-Fi şəbəkəsində olmalıdır.
3. Telefonda ünvanı açıb PIN-i yazın. Brauzer menyusundan **Add to Home Screen / Ana ekrana əlavə et** seçsəniz, sistem tətbiq kimi açılacaq.

Qeydlər:
- Videolar kompüterdə hazırlanır, telefon yalnız idarəetmə panelidir. Kompüter yanılı qalmalıdır.
- "YouTube-a qoş" (OAuth) addımını kompüterin özündə edin, çünki Google Desktop OAuth yalnız `127.0.0.1` ünvanına qayıdır.
- Evdən kənarda telefondan girmək üçün Tailscale kimi şəxsi VPN istifadə edə bilərsiniz. Portu internetə birbaşa açmayın.
- PIN `data/access_pin.txt` faylındadır. Dəyişmək üçün faylı silin, yenisi yaranacaq.

## Google Cloud (real upload və analiz üçün, bir dəfə)

1. console.cloud.google.com saytında layihə yaradın. **YouTube Data API v3** və **YouTube Analytics API**-ni Enable edin.
2. **API key** yaradın və onu Sistem ayarları → "YouTube Data API key" xanasına yazın (bazar analizi üçün).
3. OAuth consent screen: External, Test users bölməsinə öz Gmail-inizi əlavə edin.
4. **OAuth client ID → Desktop app** yaradın. Client ID və Secret-i Sistem ayarlarına yazın.

Bilməli olduğunuz məhdudiyyətlər:
- **Yoxlanılmamış Google layihəsindən yüklənən videolar private rejimdə kilidlənir.** Public dərc üçün Google-un "YouTube API Services Audit" formunu doldurun. Audit keçənə qədər videolar yüklənir, sonra onları Studio-da əl ilə public edirsiniz.
- Gündəlik kvota 10,000 vahiddir. Bir upload ≈ 1,600 vahid tutur (gündə ≈ 6 video), bir axtarış 100 vahid. Bir analiz (8 niş) ≈ 1,700 vahid tutur.
- Custom thumbnail üçün kanal telefonla təsdiqlənməlidir (youtube.com/verify).
- Kanal adı və avatar API ilə dəyişdirilmir. Təsvir, açar sözlər və banner avtomatik yazılır.
- YPP hədləri (500/3,000 saat erkən, 1,000/4,000 saat tam) YouTube-un indiki qaydalarıdır və dəyişə bilər. ETA cari templə hesablanır və proqnozdur.
- YouTube API açarı olmadan analiz AI təxminləri ilə işləyir. Hesabatda bu "AI təxmini" kimi qeyd olunur.

---

# Video Studio (video istehsal mühərriki)

SALIMOFF bu mühərriki istifadə edir. Ayrıca da işləyir: sol paneldə **Video Studio**.


Mövzu yazırsınız, proqram hazır YouTube videosu (MP4 + altyazı + başlıq/təsvir/teqlər) çıxarır. Kamera, montaj proqramı və diktor lazım deyil. Proqram öz kompüterinizdə işləyir, interfeysi brauzerdə açılır.

```
Mövzu → Ssenari (DeepSeek / Claude / OpenAI) → Səhnələrə bölmə → Hər səhnəyə vizual prompt
      → Şəkillər (OpenAI gpt-image-1, vahid stil) → [istəyə görə] səhnəni hərəkətə gətirmək (Kie.ai / fal.ai)
      → Emosiyalı səsləndirmə (Fish Audio / ElevenLabs) → Montaj (Ken Burns, keçidlər, loqo, musiqi, altyazı)
      → MP4 + .srt + YouTube metadata
```

## 1. Quraşdırma (bir dəfə)

1. **Python 3.10+**: https://www.python.org/downloads/ (Windows-da "Add Python to PATH" seçin)
2. **ffmpeg**:
   - Windows: `winget install Gyan.FFmpeg`
   - Mac: `brew install ffmpeg`
3. Proqramı işə salın:
   - Windows: `start.bat` faylına iki dəfə klikləyin
   - Mac/Linux: `./start.sh`

Brauzer avtomatik açılır: http://127.0.0.1:8765

## 2. API açarları (Ayarlar → API)

| Servis | Nə üçün | Harada alınır | Təxmini qiymət |
|---|---|---|---|
| DeepSeek | Ssenari, vizual prompt-lar | platform.deepseek.com → API keys | 15 dəq video ≈ $0.01–0.15 |
| OpenAI | Səhnə şəkilləri (gpt-image-1) | platform.openai.com → API keys | low ≈ $0.016/şəkil, high ≈ $0.25 |
| Fish Audio | Səsləndirmə + emosiyalar | fish.audio → Developers → API keys (balansı $5–10 artırın) | 1 saat ≈ $1 |
| Kie.ai | Səhnəni hərəkətə gətirmək (könüllü, ucuz aqreqator) | kie.ai → API Key, balansı Billing-dən artırın | ≈ $0.2–0.7 / klip |
| fal.ai | Kie.ai-yə alternativ (könüllü) | fal.ai → Keys | ≈ $0.2–0.7 / klip |
| Anthropic | Ssenarini Claude ilə yazmaq (könüllü) | console.anthropic.com | modeldən asılı |
| ElevenLabs | Alternativ səs (könüllü) | elevenlabs.io | planından asılı |

Hər açardan sonra **Yadda saxla**, sonra **Bağlantını yoxla** düyməsini basın. Real video üçün **Demo rejimi**ni söndürün. Demo rejimi API-siz işləyir: şəkillərin, səsin və ssenarinin yerinə süni nümunələr yaranır, xərc $0 olur. Proqramı sınamaq üçün nəzərdə tutulub.

Qiymətlər təxminidir və servislər onları dəyişə bilər. Proqram xərci **Ayarlar → Qiymətlər** tabındakı rəqəmlərlə hesablayır, rəqəmləri orada yeniləyə bilərsiniz.

**15 dəqiqəlik video üçün hesablama** (≈150 səhnə, low keyfiyyət): şəkillər ≈ $2.4, səs ≈ $0.15, ssenari ≈ $0.15. Cəmi ≈ **$2.7**.

## 3. Kanal profili qurmaq (bir kanal üçün ≈ 30 dəq)

1. **Skript** tabı: dil, danışıq tərzi, hədəf uzunluq, model (`deepseek-reasoner`), Hook & CTA, skript qaydaları.
2. **Voice-over qaydaları**: Claude və ya ChatGPT-yə bunu yazın və cavabı bu xanaya yapışdırın:
   ```
   I generate AI voice-over with Fish Audio. Give me a list of script editing rules that make the
   voice sound emotional and natural: punctuation effects (pauses, emphasis, commas, ellipses,
   exclamation) and emotion tags in parentheses like (calm), (whispering), (excited), with examples.
   I will use this list as "AI voice-over script edition" parameters in my system. Answer in English.
   ```
3. **Kitabxana → Vizual stil**: Pinterest-də bəyəndiyiniz stildə 1–2 şəkil tapın, Claude-a verib bunu yazın:
   ```
   Write a 5-sentence prompt that I can use to generate AI images in exactly this graphic style and
   design, so that any objects and scenes I need come out in the same consistent visual style.
   Do not describe the specific subject of these images, only the style.
   ```
   Cavabın ilk cümləsi **Prompt prefiks**, qalanı **Stil prompt-u** xanasına gedir. Sonra **Ayarlar → Vizual**-da bu stili seçin.
4. **Kitabxana → Personajlar** (könüllü): təkrarlanan qəhrəmanın adını və görünüşünü yazın. Ad səhnə mətnində keçəndə təsvir avtomatik prompt-a əlavə olunur və personaj bütün səhnələrdə eyni qalır.
5. **Səsləndirmə**: Fish Audio → Discovery → səsi seçin → ⋯ → **Copy model ID** → proqramda Voice ID əlavə edin.
6. **Brendinq**: şəffaf fonlu PNG loqo (default olaraq yuxarı sol küncdə, videonun 8% eni).
7. Aşağıda **Yeni profil yarat** (məsələn "English 1"). Sonrakı dəyişikliklərdən sonra **Profili yenilə** basın.

Hər kanal (dil, mövzu, stil) üçün ayrıca profil yaradın. Sol paneldə bir kliklə profillər arasında keçid edirsiniz. Belə bir kompüterdən istənilən sayda kanal idarə olunur.

## 4. Video yaratmaq

1. **Video yarat**: başlıq, qısa təsvir və uzunluq yazıb **Layihəni yarat** düyməsini basın.
2. **Ssenari**: ya **AI ilə yaz**, ya da öz mətninizi yapışdırın. Sonra **Səhnələrə böl**. Paraqraflar səhnə sərhədidir: iki paraqrafı birləşdirmək üçün onları eyni abzasa yazın.
3. **Bütün kadrları hazırla**: şəkillər paralel çəkilir (eyni anda 3 şəkil).
   - Bəyənmədiyiniz səhnədə **Vizual təsvir və final prompt** bölməsini açın, düzəldin, sonra **Şəkli yenidən yarat**.
   - **Kadrı hərəkətləndir**: proqram səhnəni Kie.ai və ya fal.ai ilə video klipə çevirir (2–5 dəq). Bunu ilk 1–2 səhnədə etmək tövsiyə olunur. Servis **Ayarlar → Hərəkət** tabında seçilir.

### Kie.ai qoşmaq
1. kie.ai saytında qeydiyyatdan keçin, **Billing**-dən balansı artırın ($5 təxminən 1000 kredit edir).
2. **API Key** bölməsində açar yaradın. Proqramda **Ayarlar → API → Kie.ai** xanasına yazın və **Bağlantını yoxla** basın. Cavabda balansınız görünməlidir.
3. **Ayarlar → Hərəkət**: servisi `kie` seçin və modeli siyahıdan seçin. Default model **Seedance 2.0**-dır (`bytedance/seedance-2`), videoda istifadə olunan da budur.

| Model (Ayarlarda) | Klip uzunluğu | Qeyd |
|---|---|---|
| `bytedance/seedance-2` | 4–15 san | 720p, kadrın formatı (16:9 / 9:16) avtomatik ötürülür |
| `bytedance/seedance-2-fast` | 4–15 san | daha tez və ucuz |
| `bytedance/v1-pro-image-to-video` / `v1-lite` | 5 və ya 10 san | 720p |
| `kling-2.6/image-to-video` | 5 və ya 10 san | modelin öz səsi söndürülür |
| `hailuo/2-3-image-to-video-standard` | 6 və ya 10 san | 768P |
| `wan/2-6-image-to-video` | 5, 10 və ya 15 san | 720p |

Proqram "Klip uzunluğu" ayarını modelin qəbul etdiyi ən yaxın dəyərə uyğunlaşdırır. Səs yaradan modellərdə modelin öz səsi söndürülür, çünki səsləndirməni Fish Audio edir. Keyfiyyəti dəyişmək üçün **Kie: əlavə parametrlər** xanasına JSON yazın, məsələn `{"resolution": "1080p"}`.

Siyahıda olmayan başqa Market modeli üçün onun ID-sini yazın. Bu halda modelin sənədindəki şəkil sahəsinin adını (`image_url`, `image_urls` və s.) da daxil edin.

İnteqrasiya docs.kie.ai sənədlərinə əsasən yoxlanılıb: tapşırıq yaratma, status sorğusu, fayl yükləmə və yuxarıdakı modellərin hər birinin parametrləri. Real açarla video hələ çəkilməyib.
4. **Hamısını səsləndir**. 20 saniyədən uzun səhnələr üçün xəbərdarlıq çıxır.
5. **Montaj et → video yarat**. Hazır MP4 `output/` qovluğuna düşür, yanında `.srt` faylı olur. Proqram YouTube üçün başlıq, təsvir, teqlər və thumbnail prompt-u da yazır.

**Tam avtomatik** düyməsi bütün addımları dayanmadan icra edir: mövzudan hazır MP4-ə qədər.

Yarım saatlıq video üçün hədəfi ~35 dəqiqə qoyun. Nəticə adətən hədəfin ±20%-i olur.

## 5. YouTube monetizasiya qaydaları haqqında

YouTube AI alətləri ilə hazırlanan kontentə icazə verir. Monetizasiya isə **orijinal və dəyər daşıyan** kontentə verilir. Mənasız, təkrarlanan "AI slop" videolar monetizasiyadan kənarda qalır. Dəyərli video belə olur: mövzunu siz seçirsiniz, ssenari məntiqli bir xətt üzrə gedir, səhnələr danışılan mətnə uyğundur və stil ardıcıldır. YouTube Studio-da real görünən sintetik məzmun üçün "altered or synthetic content" işarəsini qoymağı unutmayın.

## Texniki məlumat

- `app/salimoff/` — SALIMOFF qatı: `research` (analiz/qərar), `channel` (blueprint, profillər), `planner` (ideyalar, istehsal, slotlar, upload), `reports` (hesabat və öyrənmə), `autopilot` (fon prosesi), `ytapi` (YouTube Data/Analytics/OAuth), `routes` (API).
- `app/` — FastAPI server və brauzer interfeysi. `data/` — ayarlar, açarlar, layihələr. `output/` — hazır videolar.
- API açarları yalnız kompüterinizdə, `data/keys.json` faylında saxlanılır. Bu faylı heç kimə göndərməyin.
- Testlər (demo rejimdə, API-siz): `python -m pytest -q`
- Montaj: hər səhnə ayrıca klipə çevrilir, keçidlər 15 səhnəlik bloklarla tətbiq olunur. Ona görə 150+ səhnəlik videolar da yaddaşa ağırlıq salmadan render olunur.

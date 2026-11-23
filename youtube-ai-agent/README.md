# YouTube AI Agent

Mövzu yazırsınız, proqram hazır YouTube videosu (MP4 + altyazı + başlıq/təsvir/teqlər) çıxarır. Kamera, montaj proqramı və diktor lazım deyil. Proqram öz kompüterinizdə işləyir, interfeysi brauzerdə açılır.

```
Mövzu → Ssenari (DeepSeek / Claude / OpenAI) → Səhnələrə bölmə → Hər səhnəyə vizual prompt
      → Şəkillər (OpenAI gpt-image-1, vahid stil) → [istəyə görə] səhnəni hərəkətə gətirmək (fal.ai)
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
| fal.ai | Səhnəni hərəkətə gətirmək (könüllü) | fal.ai → Keys | ≈ $0.2–0.7 / klip |
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
   - **Kadrı hərəkətləndir**: proqram səhnəni fal.ai ilə video klipə çevirir (2–5 dəq). Bunu ilk 1–2 səhnədə etmək tövsiyə olunur.
4. **Hamısını səsləndir**. 20 saniyədən uzun səhnələr üçün xəbərdarlıq çıxır.
5. **Montaj et → video yarat**. Hazır MP4 `output/` qovluğuna düşür, yanında `.srt` faylı olur. Proqram YouTube üçün başlıq, təsvir, teqlər və thumbnail prompt-u da yazır.

**Tam avtomatik** düyməsi bütün addımları dayanmadan icra edir: mövzudan hazır MP4-ə qədər.

Yarım saatlıq video üçün hədəfi ~35 dəqiqə qoyun. Nəticə adətən hədəfin ±20%-i olur.

## 5. YouTube monetizasiya qaydaları haqqında

YouTube AI alətləri ilə hazırlanan kontentə icazə verir. Monetizasiya isə **orijinal və dəyər daşıyan** kontentə verilir. Mənasız, təkrarlanan "AI slop" videolar monetizasiyadan kənarda qalır. Dəyərli video belə olur: mövzunu siz seçirsiniz, ssenari məntiqli bir xətt üzrə gedir, səhnələr danışılan mətnə uyğundur və stil ardıcıldır. YouTube Studio-da real görünən sintetik məzmun üçün "altered or synthetic content" işarəsini qoymağı unutmayın.

## Texniki məlumat

- `app/` — FastAPI server və brauzer interfeysi. `data/` — ayarlar, açarlar, layihələr. `output/` — hazır videolar.
- API açarları yalnız kompüterinizdə, `data/keys.json` faylında saxlanılır. Bu faylı heç kimə göndərməyin.
- Testlər (demo rejimdə, API-siz): `python -m pytest -q`
- Montaj: hər səhnə ayrıca klipə çevrilir, keçidlər 15 səhnəlik bloklarla tətbiq olunur. Ona görə 150+ səhnəlik videolar da yaddaşa ağırlıq salmadan render olunur.

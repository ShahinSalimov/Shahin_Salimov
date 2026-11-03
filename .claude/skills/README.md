# Claude ilə video montaj və motion — skill dəsti

Mənbə: "Claude'la video kurgulamak için gereken her şey" (Claude ile Motion Kurulum Kiti, @kerembarant), 12 səhifə.

## Qısa izah

Əsas fikir: Claude videonu Premiere kimi əllə montaj etmir — kompüterdə alətləri işə salır,
sən isə ona montajçıya deyirmiş kimi nə istədiyini deyirsən.

### Bu kitlə Claude-da nə etmək olar

| İmkan | Necə |
|-------|------|
| **Ham videonu avtomatik montaj etmək** | Səssiz yerləri və təkrar cümlələri kəsir. Kitdəki nümunədə 5:39 dəqiqəlik ham çəkiliş 1:18 oldu |
| **Söz-söz altyazı** | Whisper danışığı saniyəsi ilə mətnə çevirir, altyazı danışıqla sinxron olur |
| **Motion qrafika** | Kinetic typography, kartlar, UI animasiyaları. Claude kodunu yazır, HyperFrames videoya çevirir |
| **Öz üslubunu öyrətmək** | Bir dəfə qayda faylı yazılır: rəng, font, altyazı yeri, qadağalar. Bundan sonra hər video eyni üslubda çıxır |
| **Sözlə revizyon** | "0:12-dəki yazı üzümü örtür, sağa çək" yazırsan, Claude dərhal düzəldir |
| **ChatGPT ilə də işləmək** | Hazır prompt şablonu var: AI kodu yazır, sən onu render edirsən |

Bütün alətlər pulsuzdur: FFmpeg, Whisper, HyperFrames, yt-dlp. Yalnız Claude Pro planı lazımdır.

### PDF-dən nə hazırlandı

1. **12 səhifə analiz edildi**, hər bölmə ayrıca Claude skill-inə çevrildi (aşağıdakı cədvəl).
2. **Uyğunlaşdırıldı.** PDF-də olmayan hissələr əlavə edildi: 9:16 Reels/TikTok formatı, Azərbaycan dili (`--language az`), platforma düymələri üçün təhlükəsiz zonalar.
3. **Şəxsi qayda faylı yazıldı:** `style-rules/examples/shahin-salimov.md` — Montserrat fontu, `#2D7CFF` vurğu rəngi, emoji olmadan, üz örtülmədən.
4. **Mac-də quraşdırıldı:** FFmpeg, Node.js, yt-dlp, Whisper, HyperFrames — hamısı yoxlanıldı.

Nəticə: Mac-də Claude Code-a bir cümlə yazırsan, o da videonu sənin üslubunda montaj edir.

## Skill-lər

| Skill | Kitdəki bölmə | Nə edir |
|-------|---------------|---------|
| `video-kurgu-setup` | Kısım 1, Addım 1–2 (səh. 2–4) | Claude desktop + Code, iş qovluğu, FFmpeg / Whisper / HyperFrames / yt-dlp quraşdırma və yoxlama |
| `style-rules` | Kısım 1, Addım 3 (səh. 5–6) | Referans videolardan və ya öz cümlələrindən qayda faylı (`style-rules.md`) yaratmaq və yeniləmək |
| `video-kurgu` | Kısım 1, Addım 4 (səh. 7–8) | Ham çəkiliş → transkript → boşluq kəsmə → səhnə-səhnə plan → təsdiq → altyazı + motion → render → revizyon |
| `hyperframes-motion-prompt` | Kısım 2 (səh. 9–11) | Söhbət pəncərəsi (Claude/ChatGPT) üçün hazır prompt şablonu, HyperFrames komandaları |

Problemlər bölməsi (səh. 12) `video-kurgu` skill-inin sonundadır.

## İstifadə

1. Bu `.claude/skills/` qovluğunu iş qovluğuna (məs. `video-kurgu/`) və ya `~/.claude/skills/`-ə köçür.
2. Claude Code-da yaz: **"Video montaj üçün quraşdırmadan keçir"** → `video-kurgu-setup`.
3. Hazır qayda faylı: `style-rules/examples/shahin-salimov.md` → iş qovluğuna `style-rules.md` adı ilə köçür. Və ya: **"Bu videoların üslubunu incələ və qayda faylı yaz: [linklər]"** → `style-rules`.
4. Ham videonu `raw/`-a qoy: **"Ham çəkilişi montaj et: boşluqları kəs, səhnə-səhnə plan göstər."** → `video-kurgu`.

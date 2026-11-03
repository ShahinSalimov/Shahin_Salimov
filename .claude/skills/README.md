# Claude ilə video montaj və motion — skill dəsti

Mənbə: "Claude'la video kurgulamak için gereken her şey" (Claude ile Motion Kurulum Kiti, @kerembarant), 12 səhifə.

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
3. **"Bu videoların üslubunu incələ və qayda faylı yaz: [linklər]"** → `style-rules`.
4. Ham videonu `raw/`-a qoy: **"Ham çəkilişi montaj et: boşluqları kəs, səhnə-səhnə plan göstər."** → `video-kurgu`.

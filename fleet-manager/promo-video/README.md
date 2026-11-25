# Park Pro — təqdimat videosunun generatoru

Tətbiqin içində gedən, zoom və işıqlandırmalı 1920×1080 təqdimat videosu yaradır.

| Fayl | Nə edir |
|---|---|
| `scenes.json` | Ssenari: hər səhnənin səsləndirmə mətni (`say`) və ekrandakı subtitri (`sub`) |
| `gen_audio.py` + `tts.py` | Azərbaycan dilində səsləndirmə (Meta MMS VITS ONNX, `TTS_MODEL`/`TTS_CFG` env) |
| `record.cjs` | Playwright + CDP screencast ilə tətbiqi 3200×1800 çəkir, kursor/çərçivə effektləri, `timeline.json` |
| `captions.cjs` | Subtitr və bölmə adı PNG-ləri |
| `compose.py` | Kamera zoom-u (ease), subtitrlər, 30 fps H.264 |
| `audio.py` | Səsin yerləşdirilməsi, fon musiqisi, ducking, SRT |
| `pages/` | İntro, final (CTA) və telefon səhnəsi səhifələri — `dist/` yanına kopyalanır |

Ardıcıllıq: `npm run build` → `dist` + `pages/*.html` ilə 4180 portunda statik server →
`gen_audio.py` → `record.cjs` → `captions.cjs` → `audio.py` → `compose.py` → ffmpeg ilə mux.

**Lisenziya qeydi:** MMS səs modeli CC-BY-NC-4.0-dır (kommersiya üçün yox). Reklamda istifadə üçün
səsləndirməni ElevenLabs və ya real diktorla əvəz edin (SRT vaxtları hazırdır).

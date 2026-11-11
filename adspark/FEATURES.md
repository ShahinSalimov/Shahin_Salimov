# Features

Status legend: **Working** = implemented and covered by tests or manual verification.

| Area | Feature | Status |
| --- | --- | --- |
| Input | Detailed brief form with Zod validation, accessible labels and error messages | Working |
| Input | 10 categories, 4 languages, 5 platforms, 4 durations, 8 tones, 9 styles, 7 goals | Working |
| Input | Brand Kit prefill, session draft, example brief | Working |
| Concepts | 5 concepts from 11 distinct advertising archetypes, style-aware selection | Working |
| Concepts | View, Edit, Regenerate one, Save (star), Regenerate unsaved, Create Full Campaign | Working |
| Script | 4/6/7/8 scenes for 15/30/45/60 s; durations always sum exactly (tested) | Working |
| Script | Scene fields: duration, visual, camera, action, on-screen text, voiceover, SFX, transition | Working |
| Script | Realistic camera directions for small crews; aspect ratio per platform | Working |
| Storyboard | Add, delete, duplicate, reorder, edit, fit timing, 4 visual styles, timed preview | Working |
| Storyboard | Original SVG sketches per shot type, labelled as illustrative | Working |
| Voiceover | Time-coded script, language/tone, reading-time estimate, copy, regenerate, sync | Working |
| Voiceover | Audio generation | Not included (no TTS provider integrated) |
| Social | Instagram, TikTok, YouTube Shorts, Facebook, hashtags, short title, CTAs | Working |
| Storage | IndexedDB, autosave, rename, duplicate, delete, reopen | Working |
| Storage | Full JSON backup/restore, per-campaign project files, damaged records skipped | Working |
| Export | PDF (Unicode font), TXT, JSON, print-friendly view | Working |
| AI | Provider interface; OpenAI-compatible and Anthropic server adapters | Working (needs your key) |
| AI | Server-side key, request validation, size limit, same-origin check, daily limits, timeout | Working |
| AI | Explicit consent before any data is sent; local fallback on errors | Working |
| Pricing | Starter / Pro / Agency proposals | Display only — no billing, no entitlements |
| Privacy | No analytics, bundled fonts, logo validation, delete-all control | Working |
| Responsive | Desktop, tablet and phone layouts; mobile navigation drawer | Working |

## Known limitations

- Data lives in one browser. There is no sync between devices (use backup files).
- Local generation fills templates; quality depends on how specific your brief is. It is not AI.
- AI output depends on the provider and model you configure.
- Edition restrictions are not enforced because no entitlement mechanism exists yet.

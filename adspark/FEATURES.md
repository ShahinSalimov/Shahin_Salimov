# Features

Status in this release (1.1.0). **Verified** = covered by automated tests that passed for this release (unit, integration or browser).

## Working features

| Area | Feature | Status |
| --- | --- | --- |
| Brief | 4-step form (Product, Audience, Format, Review), progress bar, inline validation, character counters | Verified |
| Brief | Sensible defaults, optional price, Brand Kit prefill, local draft persistence, discard | Verified |
| Concepts | 5 concepts from 11 distinct ad structures, mixed by style and category | Verified |
| Concepts | View, Edit, Regenerate one, ★ Save, Regenerate unsaved, Create Full Campaign | Verified |
| Script | 4/6/7/8 scenes for 15/30/45/60 s; durations always sum exactly | Verified |
| Script | Regenerate for another length; fit timing after edits; all scene fields editable | Verified |
| Storyboard | Add, delete, duplicate, reorder (drag and keyboard), edit, 4 sketch styles, timed preview | Verified |
| Voiceover | Time-coded script, reading-time estimate, per-scene fit, language/tone, copy, regenerate, sync | Verified |
| Social | Instagram, TikTok, YouTube Shorts, Facebook copy; hashtags; short title; CTA suggestions; copy buttons | Verified |
| Languages | Audience-facing copy in English, Azerbaijani, Turkish, Russian | Verified (automated); native review recommended |
| Storage | IndexedDB, autosave, create, rename, duplicate, reopen, delete | Verified |
| Storage | Full backup / restore, per-campaign project files, damaged records skipped, invalid files rejected | Verified |
| Export | PDF (embedded Unicode font, scenes kept on one page), TXT, JSON, print view | Verified |
| Brand Kit | Multiple profiles, logo with real file-type check, colors, tone, contact | Verified |
| Sample | Built-in sample campaign and sample PDF/TXT/JSON in `docs/demo/` | Verified |
| AI (optional) | Anthropic and OpenAI via official SDKs, structured outputs, refusal handling | Verified against local mocks only |
| AI (optional) | Server-side keys, consent gate, validation, size limit, same-origin check, daily limits, timeouts | Verified |
| Security | No analytics, CSP and security headers, build-time secret scan | Verified |
| UI | Responsive desktop/tablet/phone, skip links, focus management, reduced motion | Verified (layout and keyboard checks) |

## Demo-only or display-only

| Item | What it means |
| --- | --- |
| Demo Generation | Template-based, not AI. Quality depends on how specific the brief is. Always labelled. |
| Pricing page | Proposed editions only. No billing, no checkout, no entitlement restrictions; all features are unlocked. |
| Storyboard frames | Illustrative SVG sketches by shot type, not generated images or video. |
| Sample campaign | Fictional business, named “Sample: …”. |

## Not included

- Audio / text-to-speech generation.
- Automatic posting to social networks.
- Accounts, cloud sync or team sharing (data lives in one browser; use backup files to move it).
- Payments and plan enforcement.

## Known limitations

- The AI path has been tested only against local mock providers in this release; it has not been run with a live provider key. Model behaviour and cost depend on your provider account.
- Live OpenAI documentation could not be fetched from the build environment (network policy); the OpenAI integration was implemented from the official SDK's bundled type definitions (openai 7.55).
- Azerbaijani, Turkish and Russian templates were written carefully but have not been reviewed by native-speaking copywriters.
- Text you type in one language is inserted as-is into copy in another language.
- Browser storage can be cleared by the browser (private windows, “clear site data”). Keep backups.

# Changelog

## 1.1.0 — 2026-11-11

### Changed (naming)
- Product renamed from AdSpark to **AdSofff** to avoid confusion with an existing advertising company. Backups made under the old name still import.

### Added
- Offline single-file edition (`npm run build:standalone`): opens from `AdSofff.html` without Node.js, server or internet; hash routing, no sales pages.
- Gumroad buyer package builder with START-HERE guide (EN/AZ), end-user license and sample files.
- Four-step New Campaign brief with progress bar, inline validation, review step and local draft persistence.
- Category profiles (setting, hero shot, key moment, suited ad structures) in Demo Generation.
- Script regeneration for 15/30/45/60 s from the editor; drag-and-drop storyboard reordering.
- Voiceover per-scene fit check.
- Built-in sample campaign and sample PDF/TXT/JSON exports (`docs/demo/`).
- Campaign cards with storyboard cover and progress; card/list view in My Campaigns.
- Subtle animations, skip links, route focus management and announcements.
- ESLint (TypeScript + React Hooks) and a build-time bundle secret scan.
- Tests: form paths, category awareness, copy quality, PDF content, storage, backup/restore, AI proxy, link crawl, layout on three viewports.

### Changed
- Optional AI proxy rebuilt on the official Anthropic and OpenAI SDKs with structured outputs, refusal handling, consent header and pinned official endpoints.
- Engine labelled “Demo Generation · not AI” throughout the UI and exports.
- PDF built from a renderer-independent report model; scenes no longer split across pages.
- Benefit lists respect one-per-line input; captions no longer repeat link CTAs.

### Fixed
- Mobile logo rendered blank (duplicate SVG gradient ids).
- Campaign navigation clipped on phones; print view overflowed on phones.
- Oversized AI requests now receive HTTP 413 instead of a dropped connection.
- Grammar in Azerbaijani/Turkish templates with product names; gender-neutral Russian.
- User text no longer runs into the next sentence without punctuation.

### Removed
- Unused `jsdom` dependency.

## 1.0.0 — 2026-11-11

First release: landing, dashboard, campaign generator, script editor, storyboard studio, voiceover studio, social content, campaigns, Brand Kit, settings, pricing; IndexedDB storage; PDF/TXT/JSON export; optional AI proxy.

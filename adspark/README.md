# AdSpark

**Turn Any Product Into a Powerful Ad Campaign.**

AdSpark turns basic product information into a complete advertising campaign plan: five distinct ad concepts, a timed video script, an editable storyboard, a voiceover script and platform-specific social media copy. Campaigns export as PDF, TXT or JSON.

It is a local-first React application. It works fully offline with a **local template engine** (proven ad structures filled with your product details — clearly labelled as *not AI*). Real AI generation is an **optional** add-on through a small backend proxy that keeps your API key on the server.

## Quick start (Windows, macOS, Linux)

```bash
cd adspark
npm install
npm run dev
```

Open http://localhost:5173. See [INSTALLATION.md](INSTALLATION.md) for exact Windows steps, production mode and AI setup.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server (local engine only) |
| `npm run dev:full` | Development server + AdSpark API server (for optional AI) |
| `npm run build` | Type-check and build to `dist/` |
| `npm start` | Serve the built app and the API on http://localhost:8787 |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright, run `npm run build` first) |
| `npm run typecheck` | TypeScript check only |

## Project structure

```
adspark/
├─ src/
│  ├─ lib/
│  │  ├─ schemas.ts          Zod schemas and types (shared with the server)
│  │  ├─ engine/             Local template engine (concepts, scenes, voiceover, social, 4 languages)
│  │  ├─ ai/provider.ts      GenerationProvider interface, local + remote providers
│  │  ├─ db.ts               IndexedDB storage with validation on load
│  │  ├─ backup.ts           JSON backup / project file import and export
│  │  ├─ export/             PDF (jsPDF + DejaVu font), TXT, downloads
│  │  ├─ files.ts            Safe logo upload validation (magic bytes, size)
│  │  └─ workflow.ts         Concept and full-campaign generation steps
│  ├─ store/app.ts           Zustand store, debounced persistence
│  ├─ components/            Design system, layout, storyboard SVG frames
│  └─ pages/                 Landing, Dashboard, New Campaign, Generator, Editor,
│                            Storyboard, Voiceover, Social, Campaigns, Brand Kit,
│                            Settings, Pricing, Print view
├─ server/                   Optional AI proxy (Node http, no framework)
├─ e2e/                      Playwright tests
└─ docs: INSTALLATION, USER_GUIDE, FEATURES, PRIVACY, CHANGELOG, LICENSE-DRAFT
```

## Tech stack

React 19, TypeScript, Vite 8, Tailwind CSS 4, React Router 7, Zustand, Lucide icons, IndexedDB, jsPDF, Zod, Vitest, Playwright. The server uses only Node built-ins plus Zod (run with `tsx`).

## Honesty rules built into the product

- Local generation is always labelled “Local template engine (not AI)”, in the UI and in every export.
- Storyboard frames are labelled as illustrative sketches, never as generated frames.
- AdSpark writes voiceover scripts; it does not generate audio.
- Pricing editions are shown as proposals. There is no billing and nothing is simulated.
- Social copy never promises reach or virality.

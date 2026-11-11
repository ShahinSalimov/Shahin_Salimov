# Installation

AdSpark runs on Windows 10/11, macOS and Linux. It is light enough for a laptop with 8 GB RAM (the dev server uses roughly 200–300 MB).

## 1. Requirements

- **Node.js 22 LTS** (minimum 20.19). Download the Windows Installer (.msi) from https://nodejs.org and keep the default options.
- Git (optional, only to clone the repository).

Check in **Command Prompt** or **PowerShell**:

```bat
node -v
npm -v
```

`node -v` should print `v22.x` (or at least `v20.19`).

## 2. Install (Windows, step by step)

1. Open **PowerShell** (Start → type `PowerShell` → Enter).
2. Go to the project folder, for example:
   ```powershell
   cd C:\Users\YourName\Documents\Shahin_Salimov\adspark
   ```
3. Install dependencies (first time only, takes 1–3 minutes):
   ```powershell
   npm install
   ```
4. Start the app:
   ```powershell
   npm run dev
   ```
5. Open **http://localhost:5173** in Chrome, Edge or Firefox.

Stop the server with `Ctrl + C`.

> If PowerShell says “running scripts is disabled”, use Command Prompt (`cmd`) instead, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

## 3. Production mode (faster, single port)

```powershell
npm run build
npm start
```

Open **http://localhost:8787**. The same server hosts the app and the optional AI API.

## 4. Optional: AI generation

Without this step AdSpark uses its local template engine, which works offline.

1. Copy the example config:
   ```powershell
   copy .env.example .env
   ```
2. Edit `.env` in Notepad:
   ```
   AI_PROVIDER=openai          # or: anthropic
   AI_API_KEY=your-secret-key
   AI_MODEL=exact-model-id-from-your-provider
   ```
   - `AI_PROVIDER=openai` works with the OpenAI API and any OpenAI-compatible endpoint (set `AI_BASE_URL`).
   - `AI_MODEL` is required. AdSpark does not guess a model: use an ID your account can access.
   - Limits: `AI_DAILY_LIMIT_PER_CLIENT` (default 20) and `AI_DAILY_LIMIT_TOTAL` (default 200) requests per day.
3. Start the app with the API server:
   ```powershell
   npm run dev:full
   ```
   or, in production, `npm run build` then `npm start`.
4. In the app go to **Settings → Generation engine**, read the data notice, tick the consent box and click **Turn on AI generation**.

The key is read only by the server and is never sent to the browser. `.env` is git-ignored.

## 5. Tests

```powershell
npm test               # unit tests
npm run build
npx playwright install chromium   # first time only, downloads the test browser
npm run test:e2e       # browser tests
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Port 5173 is already in use` | Close the other dev server, or run `npm run dev -- --port 5180` |
| Campaigns disappear | Private/incognito windows delete IndexedDB when closed. Use a normal window and download backups (Settings). |
| “AI provider not available” | The API server is not running or `.env` is incomplete. The message in Settings names the missing value. |
| PDF text looks wrong | Update the browser; the PDF embeds the DejaVu Sans font for Azerbaijani, Turkish and Russian letters. |

# Installation

AdSpark runs on Windows 10/11, macOS and Linux and is light enough for a laptop with 8 GB RAM. The dev server typically uses 200–300 MB of memory; the built app runs in any modern browser.

## 1. Requirements

- **Node.js 22 LTS** (minimum 20.19). Windows: download the Windows Installer (.msi) from https://nodejs.org and keep the default options (including "Add to PATH").
- A modern browser: Chrome, Edge or Firefox (current version).

Check in **PowerShell** or **Command Prompt**:

```bat
node -v
npm -v
```

`node -v` should print `v22.x` (or at least `v20.19`).

## 2. Install and run on Windows (step by step)

1. Unzip `adspark-v1.1.0.zip`, for example to `C:\AdSpark`.
2. Open **PowerShell**: press Start, type `PowerShell`, press Enter.
3. Go to the folder:
   ```powershell
   cd C:\AdSpark
   ```
4. Install dependencies (first time only, 1–3 minutes, needs internet):
   ```powershell
   npm install
   ```
5. Start the app:
   ```powershell
   npm run dev
   ```
6. Open **http://localhost:5173**. Click **Open a sample campaign** on the dashboard to explore a finished campaign.

Stop the server with `Ctrl + C`.

> If PowerShell says “running scripts is disabled on this system”, use **Command Prompt** (`cmd`) instead, or run once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## 3. Production mode (single port)

```powershell
npm run build
npm start
```

Open **http://localhost:8787**. The same server hosts the app and the optional AI API, with security headers (Content-Security-Policy, X-Frame-Options, no-referrer).

The release ZIP already contains a built `dist/` folder, so `npm start` works right after `npm install`.

## 4. Optional: AI generation

Skip this section to use Demo Generation only.

1. Copy the example configuration:
   ```powershell
   copy .env.example .env
   ```
2. Open `.env` in Notepad and set:
   ```
   AI_PROVIDER=anthropic        # or: openai
   AI_API_KEY=your-secret-key
   AI_MODEL=exact-model-id      # required; e.g. claude-opus-5-5 for Anthropic
   ```
   | Variable | Purpose |
   | --- | --- |
   | `AI_PROVIDER` | `anthropic` (official Anthropic SDK) or `openai` (official OpenAI SDK) |
   | `AI_API_KEY` | Your provider key. Read only by the server. |
   | `AI_MODEL` | A model ID your account can access. AdSpark never guesses one. |
   | `AI_BASE_URL` | Optional. OpenAI-compatible endpoint (must be `https://`). Empty = official endpoint. |
   | `AI_STRUCTURED_OUTPUT` | OpenAI path: `auto`, `on` or `off` for strict JSON-schema output |
   | `AI_DAILY_LIMIT_PER_CLIENT` / `AI_DAILY_LIMIT_TOTAL` | Requests per UTC day (defaults 20 / 200) |
3. Start the app **with** the server:
   ```powershell
   npm run dev:full
   ```
   or `npm run build` then `npm start`.
4. In the app open **Settings → Generation engine**, read the data notice, tick the box and click **Turn on AI generation**.

`.env` is excluded from git and from the release ZIP. Keys are never sent to the browser; the build fails if anything key-like ends up in the bundle.

## 5. Tests and checks

```powershell
npm run lint
npm test
npm run build
npx playwright install chromium   # first time only: downloads the test browser
npm run test:e2e
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Port 5173 is already in use` | Close the other dev server, or run `npm run dev -- --port 5180` |
| `npm install` fails behind a company proxy | Set `npm config set proxy http://proxy:port` (ask IT) |
| Campaigns disappear after closing the browser | Private/incognito windows delete local data. Use a normal window and download backups (Settings → Backup). |
| “AI provider not available” | The server is not running or `.env` is incomplete. Settings shows which value is missing. |
| “The AI provider declined this request” | The provider refused the brief. Edit it or switch back to Demo Generation. |
| PDF letters look wrong | Update the browser. The PDF embeds DejaVu Sans for Azerbaijani, Turkish and Russian letters. |

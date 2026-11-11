# Privacy

AdSpark is local-first.

## What is stored
Campaigns, brand profiles (including logos) and settings are stored in your browser’s IndexedDB on your device. The New Campaign draft is kept in session storage until the tab closes. Nothing is stored on any AdSpark server.

## What is sent
- **Local engine (default):** nothing leaves your device.
- **Optional AI generation:** only after you turn it on in Settings and confirm the notice. When you generate, the campaign brief (product name, description, category, price, benefits, audience, problem, goal, language, platform, duration, tone, style, CTA) and the selected concept are sent to *your* AdSpark server, which forwards them to the AI provider configured in `.env`. That provider processes the data under its own terms. Brand logos and contact details are never sent.

## No tracking
No analytics, no cookies, no tracking pixels, no third-party scripts. Fonts are bundled with the app.

## Security measures
- API keys exist only in server environment variables and are never sent to the browser.
- The server validates every request (Zod), limits body size (64 KB), rejects cross-origin requests, applies daily usage limits and a 60-second timeout, and sends a strict Content-Security-Policy.
- Prompts mark user input as data so it is not treated as instructions.
- Logos must be real PNG, JPEG or WebP files (checked by file signature), up to 500 KB. SVG is rejected.
- Imports are size-limited (10 MB) and validated record by record.
- React escapes all user text; the app never injects raw HTML.

## Your controls
Settings → **Download backup**, **Restore**, and **Delete all data** (removes every campaign, brand profile and setting from this browser). You can also delete single campaigns and brand profiles.

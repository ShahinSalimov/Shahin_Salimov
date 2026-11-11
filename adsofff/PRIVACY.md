# Privacy

AdSofff is local-first. This notice describes how the software behaves; it is not a legal compliance certification.

## What is stored
Campaigns, brand profiles (including logos) and settings are stored in your browser's IndexedDB on your device. The unfinished New Campaign draft and two view preferences (card/list layout) are stored in localStorage. Nothing is stored on an AdSofff cloud: there is none.

## What is sent
- **Demo Generation (default):** nothing leaves your device.
- **Optional AI generation:** only after you turn it on in Settings and accept the notice. When you generate, the campaign brief (product name, description, category, price, benefits, audience, problem, goal, language, platform, duration, tone, style, call to action) and the selected concept are sent to *your* AdSofff server, which forwards them to the AI provider configured in `.env`. That provider processes the data under its own terms. Logos and Brand Kit contact details are never sent.
- The app asks your own AdSofff server whether AI is available (`/api/ai/status`). This request contains no campaign data.

## No tracking
No analytics, no cookies, no tracking pixels, no third-party scripts or fonts loaded from the internet.

## Security measures
- Provider keys exist only in server environment variables. The build fails if key-like strings, server code or key variable names appear in the browser bundle.
- Official provider endpoints are pinned so stray `*_BASE_URL` environment variables cannot redirect keys; custom endpoints must use `https://`.
- The server validates every request (Zod), limits body size (64 KB), rejects cross-origin requests and requests without the consent header, applies daily usage limits and timeouts, validates AI output twice, and sends a strict Content-Security-Policy.
- Prompts mark user input as data so it is not treated as instructions.
- Logos must be real PNG, JPEG or WebP files (checked by file signature), max 500 KB. SVG is rejected.
- Imports are size-limited (10 MB) and validated record by record.
- React escapes all user text; the app never injects raw HTML.

## Your controls
Settings → **Download backup**, **Restore from file**, **Delete all data**. You can also delete single campaigns and brand profiles, discard the brief draft, and turn AI generation off at any time.

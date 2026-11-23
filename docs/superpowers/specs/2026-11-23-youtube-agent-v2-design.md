# YouTube Agent v2 — design

## Intent

A personal video factory for one YouTube channel. Şahin pastes a finished script; the agent does everything
else without questions — visuals, motion, voice, edit, a long video and a Short, metadata, thumbnail — and
uploads both to the channel as **private**. Şahin reviews in YouTube Studio and makes them public himself.

v1 (`youtube-ai-agent/`) was a copy of a course's app: script writing, profiles, libraries, many providers,
11 settings tabs, per-scene editing. Most of it is not needed, and the extra surface caused today's bugs
(demo mode stored in profiles, a stale poller showing the old project).

## Goals

- One input: the script (text; blank lines separate paragraphs). One button: **Start**.
- Output per script, fully automatic:
  - long video 16:9 1920×1080, realistic cinematic look;
  - Short 9:16 1080×1920, 30–50 s, cut from the most gripping part of the same script;
  - title, description, tags for each; thumbnail for the long video;
  - both uploaded private, with captions (.srt) on the long video.
- Queue: several scripts can be added; processed one after another; survives an app restart.
- Clear progress and cost per job; a failed step can be retried without redoing finished steps.

## Non-goals

- Writing scripts (Şahin writes them).
- Multiple channels/profiles, character/style libraries, per-scene editing UI, demo mode in the UI.
- Other platforms (Instagram, TikTok), other providers (ElevenLabs, fal.ai, Claude/OpenAI as script writer).
- Publishing publicly or scheduling.

## Anti-goals (a failure even if it "works")

- Anything goes public without Şahin.
- Silent failure: a job that stops without saying which step and why.
- Spending past the per-video budget cap.
- A setup that needs re-login every week (OAuth "Testing" refresh tokens expire after 7 days).

## Constraints (verified)

- YouTube Data API v3 `videos.insert`: 100 calls/day in its own bucket; resumable upload via
  `google-api-python-client` + `google-auth-oauthlib` (`InstalledAppFlow.run_local_server`), scope
  `youtube.upload` (+ `youtube.force-ssl` for captions). Unverified API projects are **not** restricted to
  private anymore; we still upload private by choice. `status.containsSyntheticMedia` exists — set `true`.
- `thumbnails.set` ≈50 units, png/jpg ≤50 MB; needs a phone-verified channel → failure is non-fatal.
- `captions.insert` 400 units (10,000/day default) → fine.
- OAuth consent screen must be set to **In production** (unverified app warning is acceptable for own use).
- Kie.ai (verified against docs.kie.ai): createTask / recordInfo, stream file upload, Seedance 2 input
  (`first_frame_url`, integer `duration`, `aspect_ratio`).
- Runs on Şahin's Windows laptop (Python 3.13, ffmpeg via winget). No server.

## Approaches

1. **Rebuild in place, reusing v1's proven parts** (render/ffmpeg, OpenAI images, Fish TTS, Kie adapter),
   new lean pipeline + queue + YouTube upload, new 2-screen UI. — **Picked (my call; Şahin handed over
   the how).** Least risk: the montage and provider code is already tested; everything else is rewritten.
2. n8n workflow (Şahin uses n8n). Rejected: ffmpeg montage of 100+ local clips and resumable YouTube
   upload are awkward in n8n; needs a self-hosted n8n with local files anyway.
3. Cloud server with a scheduler. Rejected: hosting cost and ops for one person; the laptop is enough.

## The design

**Screens (2):**
- *Studio*: script box + optional title hint + format toggles (Long ✔ Short ✔) + **Start**; below it the
  queue: each job shows step, progress, cost, links (MP4, YouTube Studio) and **Retry** on failure.
- *Settings* (one page): API keys (DeepSeek, OpenAI, Fish Audio, Kie.ai) with "test"; voice ID + Fish model;
  YouTube: upload `client_secret.json`, **Connect channel**, connected channel name; defaults: video language
  (English), category (Autos & Vehicles = 2), max animated scenes (4), budget cap per video ($6).

**Pipeline per job (each step idempotent, state saved after each):**
1. Split script into scenes (paragraph-aware; first scenes short; ≤15 s spoken).
2. *Plan* (DeepSeek, one JSON call batched by 25 scenes): realistic 16:9 visual prompt per scene; which
   scenes to animate (first 2 + up to N−2 most dramatic); the Short segment (contiguous scenes, 30–50 s);
   metadata for long + Short; thumbnail text (2–4 words) and thumbnail image prompt.
3. Cost estimate; stop with an error if above the budget cap.
4. Images 16:9 (gpt-image-1, low, 3 in parallel).
5. Animate chosen scenes (Kie Seedance 2, 5 s, 720p).
6. Voice per scene (Fish Audio; script text passed as written).
7. Render long video (Ken Burns, crossfades, .srt).
8. Short: new 9:16 images for its scenes, reuse their audio, burned-in captions, render.
9. Thumbnail: 16:9 image + bold text overlay (Pillow).
10. Upload long (private, containsSyntheticMedia, not made for kids), set thumbnail, upload captions;
    upload Short (private). Store video IDs + Studio links.

**Fixed look (no settings):** "Cinematic realistic" style prompt + negative prompt built in.

**Tests:** fake providers via env var (`YTA_FAKE=1`) — not exposed in the UI; end-to-end test renders long +
Short and "uploads" to a fake YouTube client; unit tests for splitting, plan parsing, budget cap, retry/resume.

**Migration:** keeps `data/keys.json` so v1 keys carry over; v1 projects are not migrated.

## Left to the builder

File layout, exact prompts, thumbnail typography, Short caption style, retry/backoff details.

## Calls I made (Şahin can override)

- Short = cut from the long script, with its own vertical images.
- Animation: first 2 scenes + up to 2 dramatic ones, Seedance 2, ≈$2–3/video.
- Captions on the long video as a YouTube caption track; burned-in only on the Short.
- Budget cap $6/video; category Autos & Vehicles; metadata in English.

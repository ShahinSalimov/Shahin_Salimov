# YouTube Agent v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `youtube-ai-agent/` as a one-input video factory: script in → long video + Short rendered and uploaded private to the connected YouTube channel.

**Architecture:** Local FastAPI app + 2-screen static UI. A single background worker processes a persisted job queue; each job runs ten idempotent steps and saves state after each, so Retry resumes at the failed step. Providers (DeepSeek, OpenAI images, Fish TTS, Kie, YouTube) sit behind small functions with fake implementations selected by `YTA_FAKE=1` for tests.

**Tech Stack:** Python 3.10+, FastAPI, httpx, Pillow, ffmpeg, google-api-python-client, google-auth-oauthlib, pytest.

**Spec:** `docs/superpowers/specs/2026-11-23-youtube-agent-v2-design.md`

## Global Constraints

- Uploads are always `privacyStatus: "private"`, `containsSyntheticMedia: true`, `selfDeclaredMadeForKids: false`.
- Long video 1920×1080 16:9; Short 1080×1920 9:16, 30–50 s.
- Images: OpenAI `gpt-image-1`, quality `low`, 3 in parallel; sizes 1536x1024 (long) / 1024x1536 (Short).
- Kie.ai optional: no key → animation step skipped, job still succeeds. Model `bytedance/seedance-2`, 5 s, 720p.
- Budget cap per video, default $6, editable; job stops before spending if the estimate exceeds it.
- Defaults: language English, YouTube category `2` (Autos & Vehicles), max animated scenes 4, Fish model `s2.1-pro-free`.
- `data/keys.json` format from v1 is kept (keys `deepseek`, `openai`, `fish`, `kie`).
- No demo mode, profiles, libraries, scene editor, ElevenLabs, fal.ai, Claude script writing in v2.
- UI text in Azerbaijani.

## Review Focus

1. App closed mid-job → on restart the job is marked `stopped` and Retry resumes from the last finished step without re-paying for done images/audio. (Task 6 test `test_retry_resumes_from_failed_step`.)
2. Script too short for a 30 s Short → Short is skipped with a note, long video still uploads. (Task 3 test `test_short_segment_skipped_when_script_short`.)
3. DeepSeek returns malformed/partial plan JSON (missing scenes) → missing visuals fall back to the scene text, never crash. (Task 3 test `test_plan_fills_missing_scenes`.)
4. YouTube not connected or token revoked → upload step fails with "YouTube hesabı qoşulmayıb", video files kept, Retry works after connecting. (Task 5 test `test_upload_without_connection_fails_clearly`.)
5. Thumbnail rejected (channel not phone-verified) → job finishes with a warning, not an error. (Task 5 test `test_thumbnail_failure_is_warning`.)

---

### Task 1: Config, keys and fake providers

**Files:**
- Create: `youtube-ai-agent/app/config.py`, `youtube-ai-agent/app/providers.py`
- Delete: v1 `app/llm.py`, `app/media.py`, `app/script.py`, `app/store.py`, `app/pipeline.py`
- Test: `youtube-ai-agent/tests/test_providers.py`

**Interfaces:**
- Produces: `config.DATA`, `config.OUTPUT`, `config.FAKE: bool`; `get_settings() -> dict`, `save_settings(patch) -> dict`, `get_keys() -> dict`, `save_keys(patch)`, `masked_keys() -> dict`.
- Produces: `providers.deepseek_json(system: str, user: str) -> tuple[dict, float]`; `providers.image(prompt: str, out: Path, portrait: bool) -> float`; `providers.tts(text: str, out: Path) -> float`; `providers.animate(image: Path, prompt: str, out: Path, portrait: bool) -> float`; `providers.media_duration(path) -> float`; `providers.ProviderError`. Floats are USD cost.

- [ ] Test `test_fake_providers_produce_files`: with `YTA_FAKE=1`, `image()` writes a PNG of 1536×1024 (1024×1536 if portrait), `tts()` writes an mp3 with duration ≈ len(text)/15 s, `animate()` writes an mp4.
- [ ] Test `test_kie_input_seedance`: port v1 `kie_input` test values unchanged.
- [ ] Implement by moving v1 code (OpenAI images, Fish TTS with `model` header, Kie adapter) into `providers.py`; DeepSeek with `response_format: json_object`, model `deepseek-chat`.
- [ ] Run `python -m pytest -q tests/test_providers.py` → PASS; commit.

### Task 2: Scene splitting

**Files:** Create `app/scenes.py`; Test `tests/test_scenes.py`

**Interfaces:** Produces `split_scenes(script: str) -> list[dict]` with keys `id, text`; fixed rules: max 3 sentences, ≤15 s (225 chars), first 8 scenes 1 sentence, never across paragraphs.

- [ ] Port v1 splitting tests with these fixed values; implement by porting v1 `split_scenes`; PASS; commit.

### Task 3: Planner (one DeepSeek pass per 25 scenes) and cost estimate

**Files:** Create `app/planner.py`; Test `tests/test_planner.py`

**Interfaces:**
- Consumes: `providers.deepseek_json`, `scenes.split_scenes`.
- Produces: `make_plan(script: str, title_hint: str, settings: dict) -> tuple[dict, float]` returning
  `{"scenes": [{id, text, visual}], "animate": [ids], "short": {"start": i, "end": j} | None,
  "long_meta": {title, description, tags}, "short_meta": {...}, "thumb_text": str, "thumb_prompt": str}`;
  `estimate_cost(plan, settings, kie_enabled: bool) -> float`.
- Fixed style text `STYLE_PREFIX`/`STYLE_SUFFIX`/`NEGATIVE` (cinematic realistic) used by `image_prompt(visual, portrait) -> str`.

- [ ] `test_plan_fills_missing_scenes`: fake DeepSeek returns visuals for half the scenes → all scenes have non-empty `visual`.
- [ ] `test_animate_choice`: first 2 scene ids always in `animate`, total ≤ `max_animated`, empty when Kie key missing.
- [ ] `test_short_segment_skipped_when_script_short`: script of 15 s speech → `short is None`.
- [ ] `test_short_segment_within_30_50s`: estimated speech (chars/15) of chosen segment in [30, 50].
- [ ] `test_estimate_cost`: 70 scenes, 7 short scenes, no Kie → 77×0.016 + thumbnail 0.063 + LLM ≈ 1.30 ±0.1.
- [ ] Implement; PASS; commit.

### Task 4: Rendering long + Short and thumbnail

**Files:** Modify/keep `app/render.py`; Create `app/thumbnail.py`; Test `tests/test_render.py`

**Interfaces:**
- Produces: `render_video(scenes: list[dict], base: Path, out: Path, portrait: bool, burn_subs: bool, progress) -> dict(path, srt, duration)` where each scene has `image`, `audio`, optional `video` paths relative to `base`.
- Produces: `thumbnail.compose(image: Path, text: str, out: Path) -> Path` (1280×720 JPEG, bold uppercase text with outline, ≤2 MB).

- [ ] `test_render_long_and_short` (fake media): long is 1920×1080, Short is 1080×1920, durations ≈ sum of audio; Short file has burned subtitles (frame differs from source image).
- [ ] `test_thumbnail_size`: 1280×720, < 2 MB.
- [ ] Port v1 render with `portrait` → FRAME choice and fixed transitions (crossfade 0.4 s); PASS; commit.

### Task 5: YouTube connection and upload

**Files:** Create `app/youtube.py`; Test `tests/test_youtube.py`

**Interfaces:**
- Produces: `is_connected() -> dict | None` (channel title), `connect() -> dict` (InstalledAppFlow from `data/client_secret.json`, scopes `youtube.upload` + `youtube.force-ssl` + `youtube.readonly`, token in `data/token.json`), `upload(video: Path, meta: dict, settings) -> str` (video id, resumable, private), `set_thumbnail(video_id, image) -> None`, `upload_captions(video_id, srt, language) -> None`; `YouTubeError`.
- Fake client when `FAKE`: records calls in memory.

- [ ] `test_upload_without_connection_fails_clearly`: no token → `YouTubeError("YouTube hesabı qoşulmayıb")`.
- [ ] `test_upload_body`: fake upload sees privacyStatus private, containsSyntheticMedia true, madeForKids false, categoryId "2", Short title contains "#Shorts".
- [ ] `test_thumbnail_failure_is_warning` lives in Task 6 (job level).
- [ ] Implement; PASS; commit.

### Task 6: Job queue and pipeline

**Files:** Create `app/jobs.py`; Test `tests/test_jobs.py`

**Interfaces:**
- Consumes all of the above.
- Produces: `add_job(script: str, title_hint: str, make_long: bool, make_short: bool) -> dict`, `list_jobs() -> list[dict]`, `get_job(id) -> dict`, `retry(id)`, `stop(id)`, `delete(id)`, `start_worker()`, `recover()`.
- Job fields: `id, title_hint, script, status (queued|running|done|error|stopped), step, progress, message, warnings[], cost, plan, scenes[], long{path,srt,youtube_id}, short{...}`.
- Steps in order: `plan, budget, images, animate, voice, render_long, short_images, render_short, thumbnail, upload`.

- [ ] `test_full_job_fake`: add job with a 2-minute script → status `done`, both files exist, two fake uploads, thumbnail set, captions uploaded.
- [ ] `test_budget_cap_stops_before_images`: cap 0.01 → status `error`, message mentions budget, no image files.
- [ ] `test_retry_resumes_from_failed_step`: fake TTS raises once → `error` at `voice`; `retry` → `done`; image provider called once per scene in total.
- [ ] `test_thumbnail_failure_is_warning`: fake `set_thumbnail` raises → `done` with a warning.
- [ ] `test_queue_runs_in_order`: two jobs → second starts after first is done.
- [ ] Implement; PASS; commit.

### Task 7: API + 2-screen UI, launcher, docs

**Files:** Rewrite `app/main.py`, `app/static/{index.html,app.js,style.css}`, `README.md`, `requirements.txt`; Test `tests/test_api.py`

**Interfaces:** Endpoints `GET/PUT /api/settings`, `PUT /api/keys`, `POST /api/keys/{p}/test`, `POST /api/youtube/client-secret`, `POST /api/youtube/connect`, `GET /api/youtube`, `GET/POST /api/jobs`, `POST /api/jobs/{id}/retry|stop`, `DELETE /api/jobs/{id}`, `GET /api/jobs/{id}/file/{kind}`.

- [ ] `test_api_flow`: POST job → appears in list → finishes (fake) → file endpoint serves MP4.
- [ ] Studio screen: script box, title hint, Long/Short toggles, Start; queue list polling `/api/jobs` every 2 s (single timer, cleared on navigation).
- [ ] Settings screen: keys (+test), voice ID, Fish model, YouTube setup (client_secret upload, Connect, status), language, category, max animated, budget cap.
- [ ] README (Azerbaijani): install, Google Cloud setup incl. "In production", daily use.
- [ ] Run whole suite + Playwright smoke (create job, see done, no console errors); commit; push.

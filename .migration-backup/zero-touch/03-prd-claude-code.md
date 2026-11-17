# Hissə 3 — PRD və Claude Code ilə qurulma planı

## 3.1. Məhsul tələbləri (PRD)

### Məqsəd
İki izolyasiya olunmuş təşkilatı (Gumroad studiyası və YouTube agentliyi) 24/7, insan müdaxiləsi olmadan işlədən Python/Flask sistemi. İnsan yalnız WhatsApp hesabatlarını oxuyur və lazım olsa kill switch-i işə salır.

### Uğur meyarları (MVP)
| # | Meyar | Necə yoxlanılır |
|---|-------|-----------------|
| S1 | `studio_daily` run-ı başdan sona keçir və Gumroad-da yeni məhsul görünür (və ya plan B-də draft + təsdiq linki) | `runs.status = done`, `products.gumroad_url` dolu |
| S2 | Gumroad satışı 5 dəqiqə ərzində WhatsApp-a hesabat kimi düşür | Test satış (100% endirim kodu ilə) |
| S3 | `youtube_daily` run-ı scheduled (private + publishAt) video yükləyir | `videos.youtube_video_id` dolu |
| S4 | Server restart olanda yarımçıq run davam edir | Run ortasında prosesi öldür, yenidən başlat |
| S5 | Agent səhv JSON qaytaranda sistem çökmür, yenidən soruşur | Unit test: saxta LLM pis JSON qaytarır |
| S6 | Bir təşkilatın açarı/DB-si digərindən görünmür | `ORG=youtube` ilə studio addımı enqueue etmək → rədd |
| S7 | Günlük büdcə limiti işləyir | `DAILY_BUDGET_USD=0.01` ilə run `rejected` |

### Əhatədən kənar (MVP-də yoxdur)
Veb dashboard (yalnız `/health` JSON), çoxlu YouTube kanalı, ödənişli reklam, Instagram/TikTok paylaşımı. Bunlar v2-dədir.

### Asılılıqlar və riskler
| Risk | Təsir | Həll |
|------|-------|------|
| Gumroad API məhsul yaratmağı dəstəkləmir | S1 bloklanır | `GumroadPublisher` interfeysi: `ApiPublisher` → `BrowserPublisher` (Playwright) → `DraftPublisher` (fayllar + WhatsApp təsdiq linki). Mərhələ 4-də ilk iş real API-ni yoxlamaqdır |
| YouTube API audit olunmayıb | Videolar private qalır | Google API audit formu; audit bitənə qədər scheduled private + WhatsApp-a "public et" linki |
| YouTube kvotası (10 000 unit/gün) | Gündə az upload | Gündə 1-3 video; `search.list` (100 unit) əvəzinə mümkün olduqca `videos.list` |
| AI məzmun monetizasiya siyasəti | YPP rədd | Script Writer orijinallıq qaydaları, `containsSyntheticMedia`, Growth Banker-in həftəlik keyfiyyət analizi |
| WhatsApp template təsdiqi | Bildiriş getmir | Twilio sandbox ilə başla; production-da `daily_report` template-i təsdiqlət |
| Replit VM yuxuya gedir | 24/7 pozulur | **Reserved VM Deployment** (Autoscale yox) |
| LLM xərci nəzarətdən çıxır | Zərər | BudgetGuard + ayrı API açarları + Console-da spend limit |

### Qeyri-funksional tələblər
- Python 3.12, `uv` və ya `pip` + `requirements.txt`
- Test əhatəsi: `core/` üçün ≥ 80%; bütün xarici API-lər mock ilə test olunur, testlər internet tələb etmir
- Bütün log-lar JSON formatında, `run_id` ilə
- Heç bir açar kodda, git-də və ya log-da olmamalıdır

## 3.2. Qovluq strukturu

```
zero-touch-system/
├── CLAUDE.md                      # Claude Code üçün layihə qaydaları (aşağıda nümunə)
├── README.md
├── requirements.txt
├── .env.example                   # yalnız açar adları, dəyər yox
├── .replit                        # run = "python app.py"
├── app.py                         # Flask: /health, /webhooks/gumroad, /admin/*
├── worker.py                      # (opsional) ayrı prosesdə runner + scheduler
├── core/
│   ├── __init__.py
│   ├── bootstrap.py               # ORG-a görə runtime yığır
│   ├── config.py                  # env oxuma, Pydantic Settings
│   ├── envelope.py                # Envelope modeli, new_envelope()
│   ├── pipeline.py                # Step, Pipeline dataclass-ları
│   ├── runner.py                  # tick(), retry, fan-out/join
│   ├── db.py                      # JobStore (SQLite WAL), miqrasiyalar
│   ├── agents.py                  # AgentRegistry, JSON validasiya + retry
│   ├── llm.py                     # LLMClient (Claude API), xərc hesablaması
│   ├── prompts.py                 # prompt faylı yükləyici + versiya
│   ├── guards.py                  # BudgetGuard, KillSwitch, RateLimiter
│   ├── scheduler.py               # APScheduler job-ları
│   ├── logging.py                 # JSON log, secret masking
│   └── tools/
│       ├── __init__.py            # ToolRegistry
│       └── whatsapp.py            # Twilio / Cloud API adapter
├── orgs/
│   ├── studio/
│   │   ├── pipeline.py            # studio_daily, studio_sales_report, studio_weekly_reflect
│   │   ├── payloads.py            # addım-addım payload builder-lər
│   │   ├── schemas.py             # 5 agentin Pydantic modelləri
│   │   ├── schedule.py            # cron qaydaları
│   │   └── tools/
│   │       ├── market_signals.py  # pytrends, Reddit, Gumroad Discover
│   │       ├── build_assets.py    # md → PDF, csv → xlsx, zip
│   │       ├── gumroad.py         # GumroadClient + Publisher strategiyaları
│   │       └── ledger.py          # satış, fee, xərc hesablaması (LLM yox)
│   └── youtube/
│       ├── pipeline.py
│       ├── payloads.py
│       ├── schemas.py
│       ├── schedule.py
│       └── tools/
│           ├── yt_signals.py      # YouTube Data API, outlier hesablaması
│           ├── tts.py             # TTS adapter
│           ├── media_gen.py       # şəkil/video generasiya adapter
│           ├── render.py          # FFmpeg/MoviePy montaj
│           ├── qc.py              # ffprobe, loudness, qara kadr yoxlaması
│           ├── youtube_upload.py  # OAuth refresh, videos.insert, thumbnails.set
│           └── yt_analytics.py    # YouTube Analytics API
├── prompts/
│   ├── _common.md
│   ├── studio/   ceo.md research.md content.md philosopher.md banker.md
│   └── youtube/  trend_scout.md script_writer.md media_producer.md seo_upload.md growth_banker.md
├── data/                          # .gitignore — DB və render faylları
├── scripts/
│   ├── init_db.py
│   ├── replay.py                  # run-ı addım-addım göstər
│   ├── dry_run.py                 # FakeLLM + fake tools ilə tam dövrə
│   └── youtube_oauth.py           # bir dəfəlik refresh token almaq
└── tests/
    ├── conftest.py                # FakeLLM, fake tools, tmp DB
    ├── test_envelope.py
    ├── test_runner.py
    ├── test_agents_validation.py
    ├── test_guards.py
    ├── test_isolation.py
    ├── studio/test_pipeline.py
    └── youtube/test_pipeline.py
```

### `CLAUDE.md` nümunəsi (repo kökünə qoy)

```markdown
# Zero-Touch System — rules for Claude Code

- Python 3.12, Flask, Pydantic v2, APScheduler, SQLite (WAL). No Celery/Redis.
- Two orgs: studio and youtube. Code under orgs/<org>/ must never import from the other org. core/ must not import from orgs/.
- Agents never call each other. Agents return JSON; core/runner.py routes.
- Every agent output is validated by a Pydantic model with extra="forbid".
- Money and metrics are computed in code (ledger.py, yt_analytics.py), never by the LLM.
- All external APIs go through orgs/<org>/tools/ adapters and are mocked in tests. Tests must pass offline.
- Never hardcode secrets. Read from env via core/config.py. Never log secrets.
- Model ids come from env (LLM_MODEL_HEAVY, LLM_MODEL_LIGHT).
- Before claiming a task is done: run `pytest -q` and `python scripts/dry_run.py --org studio` and `--org youtube`.
```

### `.env.example`

```
ORG=studio
PORT=8080
ADMIN_TOKEN=
DAILY_BUDGET_USD=5
ANTHROPIC_API_KEY=
LLM_MODEL_HEAVY=
LLM_MODEL_LIGHT=
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
WHATSAPP_TO=
# studio
GUMROAD_ACCESS_TOKEN=
GUMROAD_PING_SECRET=
GUMROAD_PUBLISH_MODE=api   # api | browser | draft
# youtube
YT_CLIENT_ID=
YT_CLIENT_SECRET=
YT_REFRESH_TOKEN=
YT_CHANNEL_ID=
TTS_API_KEY=
MEDIA_GEN_API_KEY=
```

## 3.3. Addım-addım tapşırıqlar (Claude Code üçün)

Hər mərhələni ayrı Claude Code sessiyasında və ya ardıcıl prompt kimi ver. Hər mərhələ test ilə bitir və commit olunur. Aşağıdakı prompt-lar hazır kopyalanabilir.

### Mərhələ 0 — Repo hazırlığı (10 dəq)

```text
Create a new Python 3.12 project "zero-touch-system" with the folder structure from zero-touch/03-prd-claude-code.md section 3.2. Create empty modules with docstrings only, requirements.txt (flask, pydantic, pydantic-settings, apscheduler, anthropic, requests, tenacity, python-ulid, pytest, pytest-cov, freezegun, responses), .gitignore (data/, .env, __pycache__), .env.example, .replit (run = "python app.py"), and CLAUDE.md with the rules from the same section. Copy the 11 prompt texts from zero-touch/01-agent-system-prompts.md into prompts/ files exactly, adding a first line "version: 1.0.0". Do not implement logic yet. Commit.
```

### Mərhələ 1 — Core: envelope, DB, pipeline (1-2 saat)

```text
Implement core/envelope.py, core/pipeline.py and core/db.py following zero-touch/02-orchestration-architecture.md sections 2.2, 2.3 and 2.7.
- Envelope: Pydantic model with all fields from 2.2; new_envelope() generates ULID message_id and idempotency_key "{run_id}:{step}:{index}".
- JobStore on SQLite WAL with: create_run, get_run, save_state, finish_run, enqueue, claim_next (atomic: UPDATE ... WHERE id = (SELECT ...) RETURNING), complete, retry(delay_s, attempt), fail, has_completed, get_output, outputs_of(run_id), queue_depth, fan-out join counters.
- Write tests first (TDD) in tests/test_envelope.py and tests/test_db.py, including: claim_next never returns the same job twice, retry respects run_after, a job of org A is never claimed by org B.
Run pytest -q and commit.
```

### Mərhələ 2 — LLM klienti və agent validasiyası (1 saat)

```text
Implement core/llm.py (LLMClient wrapping the Anthropic Python SDK messages API; returns text and meta with input_tokens, output_tokens, cost_usd computed from a per-model price table in config; model ids from env), core/prompts.py and core/agents.py following section 2.5.
Add tests/conftest.py with FakeLLM that returns scripted responses per agent. Tests: valid JSON passes; JSON in ``` fences is accepted; invalid JSON triggers a corrective retry; after 3 invalid outputs a ValueError is raised; extra keys are rejected.
Implement orgs/studio/schemas.py and orgs/youtube/schemas.py as Pydantic models exactly matching every OUTPUT SCHEMA in zero-touch/01-agent-system-prompts.md, with extra="forbid". Add one valid example fixture per schema in tests/fixtures/ and test each validates.
Run pytest and commit.
```

### Mərhələ 3 — Runner, guards, Flask (2 saat)

```text
Implement core/runner.py (section 2.4), core/guards.py (BudgetGuard, KillSwitch, RateLimiter per section 2.8), core/tools/__init__.py (ToolRegistry), core/tools/whatsapp.py (Twilio adapter, plus a "console" provider that only logs, used in tests and dry runs), core/scheduler.py, core/bootstrap.py and app.py (section 2.6).
Tests (offline, FakeLLM + fake tools):
- a 3-step toy pipeline runs to "done";
- an exception retries with backoff 60/240/960s (use freezegun) and fails after 3 attempts with a WhatsApp notification;
- status "rejected" ends the run;
- fan-out of 4 children joins into exactly one next job;
- idempotent step is not executed twice;
- budget exceeded rejects the run;
- kill switch stops tick();
- restart: create a run, process 2 steps, rebuild the runtime from the same DB file, continue to done.
Run pytest and commit.
```

### Mərhələ 4 — Studio təşkilatı (3-4 saat)

```text
First, check the current official Gumroad API documentation and report whether creating a product via API is supported. Do not guess; if you cannot verify, say so and implement all three publishers.
Implement orgs/studio/: pipeline.py and payloads.py (section 2.3), tools/market_signals.py (pytrends + Reddit public JSON with a fixed User-Agent "zero-touch-research/1.0", graceful degradation if a source fails), tools/build_assets.py (markdown → PDF via a pure-Python library, CSV → XLSX via openpyxl, zip bundle, assets_manifest with excerpts), tools/gumroad.py (GumroadClient for sales, products, enable/disable, offer codes, resource_subscriptions; Publisher interface with ApiPublisher, BrowserPublisher stub, DraftPublisher selected by GUMROAD_PUBLISH_MODE), tools/ledger.py (pure functions, Decimal math), schedule.py.
Add scripts/dry_run.py --org studio that runs studio_daily and studio_sales_report end to end with FakeLLM and fake tools, prints every envelope, and exits non-zero on failure.
Tests for: route_after_review (approve / revise twice / reject), ledger math, Gumroad ping dedup by sale_id, topic_key uniqueness.
Run pytest and the dry run, then commit.
```

### Mərhələ 5 — YouTube təşkilatı (4-5 saat)

```text
Implement orgs/youtube/ following the youtube_daily and youtube_weekly_growth pipelines in section 2.3.
- tools/yt_signals.py: YouTube Data API v3 via requests, outlier_ratio computed in code, quota counter persisted per day.
- tools/tts.py and tools/media_gen.py: provider adapters behind an interface; a "fake" provider that generates silent audio and solid-color images with ffmpeg for tests.
- tools/render.py: execute media_producer render_plan with ffmpeg (scenes, kenburns via zoompan, burned subtitles from word timings, music ducking, loudnorm to -14 LUFS).
- tools/qc.py: ffprobe duration, ebur128 loudness, blackdetect, file size; returns qc_report.
- tools/youtube_upload.py: OAuth2 refresh token flow, resumable videos.insert with snippet and status from SEO agent (privacyStatus private + publishAt, containsSyntheticMedia), thumbnails.set; idempotent by topic_key.
- tools/yt_analytics.py: YouTube Analytics API reports; estimatedRevenue only if the scope is granted, otherwise null.
- scripts/youtube_oauth.py: one-time local flow that prints a refresh token.
Throttle flag from growth_banker halves the schedule. Add scripts/dry_run.py --org youtube with fake providers producing a real 10-second mp4 in data/.
Tests offline. Run pytest and the dry run, then commit.
```

### Mərhələ 6 — İzolyasiya, observability, deploy (1-2 saat)

```text
Add tests/test_isolation.py: importing core.bootstrap with ORG=studio must not import any orgs.youtube module (check sys.modules) and vice versa; a youtube envelope enqueued in the studio DB is rejected.
Add JSON logging with run_id and secret masking, /health with queue depth and last run, scripts/replay.py <run_id>.
Write DEPLOY.md: two Replit projects from the same repo, ORG secret per project, Reserved VM deployment, Gumroad ping URL setup, Twilio WhatsApp sandbox setup, YouTube OAuth and API audit note, Anthropic spend limits per key, how to use /admin/kill.
Run the full test suite with coverage (core/ >= 80%) and both dry runs. Commit.
```

### Mərhələ 7 — Canlı sınaq (insan bir dəfə edir)

1. Replit-də `zt-studio` Repl-i: Secrets daxil et, `GUMROAD_PUBLISH_MODE=draft`, `DAILY_BUDGET_USD=2`. `POST /admin/run/studio_daily` ilə bir run başlat, WhatsApp-a gələn nəticəni yoxla.
2. Draft məhsul keyfiyyətlidirsə, `api` (və ya `browser`) rejiminə keç.
3. 100% endirim kodu ilə özün test alışı et → S2 yoxlanılır.
4. `zt-youtube` Repl-i: `scripts/youtube_oauth.py` lokal kompüterdə işlət, refresh token-i Secrets-ə qoy. İlk 7 gün videolar private scheduled qalsın, keyfiyyəti gözlə yoxla.
5. Hər iki Repl-i **Reserved VM** kimi deploy et. Bundan sonra sistem zero-touch rejimindədir.

## 3.4. Təxmini aylıq xərc (orientir, dəqiq deyil)

Qiymətlər provayderə və həcmə görə dəyişir; aşağıdakılar planlaşdırma üçün kobud diapazondur, öz hesabında yoxla.

| Bənd | Diapazon |
|------|----------|
| Replit Reserved VM × 2 | Replit-in cari tarifinə bax |
| LLM (studio: gündə 1 məhsul; youtube: gündə 1-2 video) | `DAILY_BUDGET_USD` ilə sərt limitlə: məsələn 2 × $3/gün → maks ~$180/ay |
| TTS + şəkil/video generasiya | Ən böyük dəyişən xərc; `realistic` AI video çox bahadır, başlanğıcda `ai_image_kenburns` + `stock_broll` istifadə et |
| Twilio WhatsApp | Mesaj başına kiçik ödəniş |
| Gumroad | Satışdan komissiya (cari faizi Gumroad-da yoxla) |

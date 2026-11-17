# AegisPulse

Autonomous AI & dark-web threat intelligence platform. Raw intel from dark-web forums, Telegram channels, paste sites and the NVD feed goes through three Claude agents (triage, ATT&CK context, remediation). The result is grounded, schema-validated intelligence with ready-to-review patch scripts, firewall/WAF rules, detection rules, alerts and STIX 2.1 / CEF exports.

## Architecture

```
 Collectors / API clients            FastAPI (backend/main.py)                 Worker (backend/worker.py)
 ─────────────────────────   POST    ──────────────────────────   Redis   ──────────────────────────────────────
 Dark web · Telegram · Paste ──────► /api/threats/ingest  ──────► queue ───► agents/threat_pipeline.py
 NVD · Simulator                     /api/simulate-attack                      sanitize → Agent 1 Triage
                                     X-API-Key + rate limits                   → Agent 2 ATT&CK (tool use)
                                            │                                  → Agent 3 Remediation
                                            │ PostgreSQL + pgvector            → grounding & validation
                                            ▼                                         │
 Next.js SOC dashboard  ◄── SSE /api/stream ── threat_events, mitigation_patches, ◄───┘
 (server-side API proxy)                        alert_logs, company_profiles
                                            │
                                            ├─► Slack · Twilio WhatsApp · signed SOAR webhook (severity ≥ 8)
                                            └─► STIX 2.1 bundle · ArcSight CEF export
```

| Layer | Implementation |
|---|---|
| AI orchestration | Anthropic Python SDK, `claude-opus-5-5` (configurable). Structured outputs (`output_config.format`) for every agent, strict read-only tools for Agent 2, server-side refusal fallbacks, prompt caching on system prompts |
| Backend | Python 3.12, FastAPI (async), Pydantic v2, SQLAlchemy 2 async + asyncpg |
| Queue | Redis list consumed by a horizontally scalable worker; in-process fallback for local dev |
| Data | PostgreSQL 16 + pgvector (embedding column reserved for threat correlation) |
| Frontend | Next.js 15 App Router, TypeScript (strict), Tailwind CSS, lucide-react |
| Delivery | Docker multi-stage images (non-root), `docker compose` stack with health checks |

### Repository layout

```
aegispulse/
├── agents/                     # framework-agnostic AI engine (no web/DB imports)
│   ├── threat_pipeline.py      # 3-agent orchestration, tool loop, error model
│   ├── schemas.py              # Pydantic contracts = JSON schemas sent to Claude
│   ├── prompts.py              # static (cacheable) system prompts
│   ├── sanitizer.py            # Unicode/control stripping, injection signals, nonce envelope
│   ├── ioc_extractor.py        # regex IoC extraction + grounding against source
│   ├── mitre_catalog.py        # curated ATT&CK Enterprise catalog (tool backend)
│   ├── stack_matching.py       # deterministic stack-exposure scoring
│   └── script_validator.py     # bash -n / AST / JSON validation, risk scoring
├── backend/
│   ├── main.py                 # FastAPI app and all endpoints
│   ├── analysis_service.py     # atomic job claim, persistence, auto-dispatch
│   ├── worker.py               # Redis consumer with stale-job recovery
│   ├── task_queue.py           # Redis / in-process queue
│   ├── dispatcher.py           # Slack, Twilio WhatsApp, HMAC webhook (SSRF-guarded)
│   ├── simulator.py            # 5 realistic attack scenarios
│   ├── integrations/siem_exporter.py   # STIX 2.1 + ArcSight CEF
│   ├── security.py             # X-API-Key auth, rate limiting
│   ├── models.py / schemas.py / db.py / config.py / logging_setup.py
│   └── requirements.txt
├── frontend/                   # Next.js SOC command center
│   ├── app/api/backend/[...path]/route.ts   # server-side proxy (API key never reaches browser)
│   ├── components/             # TelemetryBar, ThreatFeed, ThreatInspector, MitreMatrix,
│   │                           # RemediationTerminal, DispatchDialog, StackConfigurator, AttackTrigger
│   ├── hooks/useLiveData.ts    # SSE + polling fallback
│   └── lib/                    # typed API client, highlighter, formatting
├── docker/                     # backend/frontend Dockerfiles, Postgres init (pgvector)
├── tests/                      # pytest suite (mocked Anthropic transport)
├── docker-compose.yml
├── .env.example
├── pyproject.toml / requirements-dev.txt
```

## Quick start (Docker, one command)

Requirements: Docker 24+ with Compose v2, and an Anthropic API key.

```bash
cd aegispulse
cp .env.example .env
# Edit .env:
#   POSTGRES_PASSWORD   - strong password
#   AEGIS_API_KEYS      - comma-separated API keys (openssl rand -hex 32)
#   DASHBOARD_API_KEY   - one of AEGIS_API_KEYS (used by the dashboard server)
#   ANTHROPIC_API_KEY   - your Anthropic key
docker compose up -d --build
```

| Service | URL |
|---|---|
| SOC dashboard | http://localhost:3000 |
| API | http://localhost:8000 (`/health` is public; `/docs` only when `AEGIS_ENV=development`) |

Then click **Trigger Live Dark Web Attack** in the dashboard header. You can also use the arrow next to it to pick one of the five scenarios. The threat shows up in the feed right away, and you can watch Agent 1 → 2 → 3 run in the inspector.

### Local development (without Docker)

```bash
# Backend
python3.12 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
export AEGIS_ENV=development DATABASE_URL=sqlite+aiosqlite:///./aegis.db ANTHROPIC_API_KEY=sk-ant-...
uvicorn backend.main:app --reload          # in-process queue when REDIS_URL is unset

# Frontend
cd frontend && npm ci
BACKEND_URL=http://localhost:8000 npm run dev
```

## Environment variables

All settings are documented in [`.env.example`](.env.example). The important ones:

| Variable | Purpose |
|---|---|
| `AEGIS_API_KEYS` | Accepted `X-API-Key` values. Required when `AEGIS_ENV=production` (the API refuses to start without them) |
| `DASHBOARD_API_KEY` | Key the Next.js server injects into proxied requests |
| `ANTHROPIC_API_KEY`, `AEGIS_MODEL` | AI engine. Default model `claude-opus-5-5` |
| `AEGIS_*_EFFORT` | Per-agent effort (`low`…`max`) |
| `AEGIS_ENABLE_FALLBACKS` | Server-side refusal fallbacks (beta). Set `false` on Bedrock/Vertex/Foundry |
| `AEGIS_ALERT_SEVERITY_THRESHOLD` | Auto-dispatch threshold (default 8.0) |
| `SLACK_WEBHOOK_URL`, `TWILIO_*`, `ALERT_WEBHOOK_URL/SECRET` | Alert channels. Unset channels are logged as `skipped` |

## API

All `/api/*` routes require `X-API-Key`.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/threats/ingest` | `{raw_text, source, source_ref?, company_id?, analyze}`. Deduplicates on normalised SHA-256 per company |
| GET | `/api/threats` | Stack-aware priority ranking (`sort=priority\|recent`, `min_severity`, `status`) |
| GET | `/api/threats/{id}` | Full agent output, patches, alerts |
| POST | `/api/threats/{id}/analyze` | Re-run the pipeline (expensive-bucket rate limit) |
| GET | `/api/threats/{id}/export/stix` | STIX 2.1 bundle (`application/stix+json;version=2.1`) |
| GET | `/api/threats/{id}/export/cef` | ArcSight CEF, one event per IoC plus a summary event |
| GET / POST | `/api/threats/{id}/alert-preview`, `/dispatch` | Slack / WhatsApp / webhook |
| POST | `/api/patches/{id}/approve`, `/reject`, `/simulate` | Human approval. `simulate` is static analysis only and never executes anything |
| PUT | `/api/companies/{id}/stack` | Updates the stack. Threats re-rank instantly with no model call |
| POST | `/api/simulate-attack` | `{scenario_id?}`. Injects a demo attack and analyses it |
| GET | `/api/telemetry`, `/api/stream` | Dashboard metrics. Server-Sent Events change feed |

## Security model

* **Prompt-injection defence in depth.** NFKC normalisation; zero-width, bidi and control-character stripping; injection signal detection; a nonce-tagged untrusted-data envelope that can't be forged; a static system-prompt policy; schema-constrained outputs; and read-only tools. Indicators must occur in the source, ATT&CK IDs must exist in the catalog, and stack impacts must reference real components. Any injection signal forces human review.
* **Nothing AI-generated is executed.** Scripts are syntax-checked with `bash -n` / `ast.parse`, risk-scored, and need explicit human approval.
* **Alerting is decided by code**, not by a model (severity threshold), and outbound URLs are HTTPS-only with SSRF guards.
* **API:** constant-time API-key comparison, per-key rate limits (Redis-backed), strict Pydantic input models (`extra="forbid"`, length bounds), allowlisted CORS, security headers, JSON logs without secrets, non-root containers.
* **Dashboard:** the API key stays server-side and the proxy forwards only allowlisted paths. The dashboard itself has no login, so in production put it behind your SSO (e.g. oauth2-proxy, Cloudflare Access, ALB OIDC).

## Testing

```bash
pip install -r requirements-dev.txt
pytest -q          # 81 tests, ~6 s, no network or API spend
ruff check .
cd frontend && npx tsc --noEmit && npm run build
```

The Anthropic API is mocked at the HTTP transport (`httpx2.MockTransport`), so every test exercises the real SDK request serialisation and response parsing.

## Technical due diligence checklist

| Area | Check | How it was verified | Result |
|---|---|---|---|
| Ingestion & dedup | Normalised-hash dedup, concurrent-insert race (unique constraint + IntegrityError recovery), input validation (length, unknown fields, control chars) | `tests/test_api.py` | Pass |
| Pipeline schema | Every agent output validated against Pydantic schema; one repair round on schema violation; truncation/refusal raise typed errors | `tests/test_pipeline.py` | Pass |
| Request shape | Structured outputs, fallbacks beta header, strict tools, cache_control, thinking blocks echoed with signatures across tool rounds | `tests/test_pipeline.py` | Pass |
| Grounding | Hallucinated IoCs dropped; unknown ATT&CK IDs dropped; wrong tactics corrected; unknown stack components dropped | `tests/test_pipeline.py`, mutation-tested | Pass |
| Prompt injection | Sanitizer signals, envelope forgery, injection scenario forces human review and does not lower severity | `tests/test_sanitizer_and_iocs.py`, `tests/test_pipeline.py` | Pass |
| Remediation scripts | bash/python syntax, destructive-pattern risk scoring, firewall/WAF rule validation, validator never executes | `tests/test_remediation_validation.py` | Pass |
| Concurrency | Atomic `queued→analyzing` claim; 4 concurrent runs analyse once; stale-job recovery in worker | `tests/test_api.py` | Pass |
| Simulator | All 5 scenarios trigger all 3 agents and persist patches, ATT&CK and IoCs | `tests/test_api.py` + live Docker stack | Pass |
| STIX 2.1 | Bundle parsed by the OASIS `stix2` reference library; refs resolve; deterministic IDs; pattern escaping | `tests/test_siem_export.py` | Pass |
| CEF | Header/extension escaping, one event per IoC, severity mapping | `tests/test_siem_export.py` | Pass |
| Auth & rate limits | 401 without/with wrong key on all `/api` routes; 429 + Retry-After on expensive bucket; CORS allowlist | `tests/test_api.py`, live stack | Pass |
| Alerting | Slack Block Kit, Twilio form/auth, HMAC signature, 1600-char WhatsApp limit, SSRF guard, blank env = unconfigured | `tests/test_dispatcher.py` | Pass |
| Docker | Both images build; compose stack (db+pgvector, redis, backend, worker, frontend) reaches healthy; pgvector extension present | `docker compose up` | Pass |
| End-to-end UI | Attack trigger → live agent progress → MITRE/Stack/Remediation tabs → Copy, Simulate, Approve, Dispatch, STIX/CEF download, stack re-rank, re-run; 0 console errors; no horizontal scroll at 390 px | Playwright against the Docker stack (mock Anthropic endpoint) | Pass |

**Bugs found and fixed during verification:** blank env vars from compose made unconfigured alert channels look configured (alerts logged as `failed` instead of `skipped`); horizontal overflow on mobile in the threat feed; standalone build tracing root picked up the parent pnpm workspace.

**Not yet verified:** analysis quality against the live Anthropic API. Every test and the end-to-end run used a mocked model endpoint, so the agents' real outputs (and refusal rates on dark-web content) need a run with a real key. Collectors for Telegram, paste sites and NVD polling are the next phase; today intel enters through `POST /api/threats/ingest` or the simulator. Schema changes use `create_all` at startup, so add Alembic migrations before production data exists.

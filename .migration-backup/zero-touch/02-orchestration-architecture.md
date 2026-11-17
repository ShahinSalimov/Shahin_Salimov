# Hissə 2 — Orkestrasiya arxitekturası (Python)

## 2.1. Əsas qərarlar

| Qərar | Seçim | Səbəb |
|-------|-------|-------|
| Orkestrasiya modeli | **Deklarativ pipeline + state machine**, agentlər bir-birini birbaşa çağırmır | Hər keçid DB-də qeyd olunur; server restart olsa, dövrə qaldığı yerdən davam edir |
| Növbə | DB-də `jobs` cədvəli (SQLite WAL, sonra Postgres) | Replit-də Redis/Celery əlavə xidmət tələb edir; DB növbəsi bir VM üçün kifayətdir |
| Scheduler | APScheduler (`BackgroundScheduler`) Flask prosesinin içində | Gündəlik dövrələr, saatlıq satış yoxlaması |
| Kommunikasiya | Standart JSON **envelope** | Bütün agentlər eyni formatı danışır, log və replay asandır |
| Validasiya | Pydantic v2 modelləri, hər agent üçün | LLM-in səhv JSON-u növbəti agentə keçmir |
| İzolyasiya | `ORG=studio` və ya `ORG=youtube` env dəyişəni, ayrı Repl, ayrı DB faylı, ayrı Secrets | Bir təşkilatın xətası və ya açarı digərinə təsir etmir |
| LLM | Claude API, model adı env-dən (`LLM_MODEL_HEAVY`, `LLM_MODEL_LIGHT`) | CEO/Philosopher/Script Writer ağır model, qalanları yüngül |

## 2.2. JSON Envelope protokolu

Agentlər arasında ötürülən hər mesaj bu formadadır:

```json
{
  "envelope_version": "1.0",
  "message_id": "01JD3K8Z9Q7X6W5V4T3S2R1P0N",
  "run_id": "studio-2026-11-16-001",
  "org": "studio",
  "step": "content.section",
  "from_agent": "ceo",
  "to_agent": "content",
  "attempt": 1,
  "created_at": "2026-11-16T06:00:12Z",
  "idempotency_key": "studio-2026-11-16-001:content.section:3",
  "prompt_version": "1.0.0",
  "context": {
    "market_language": "en",
    "learned_directives": ["..."]
  },
  "payload": { "...agentə xas input/output...": "" },
  "meta": {
    "model": "env:LLM_MODEL_LIGHT",
    "input_tokens": 0,
    "output_tokens": 0,
    "cost_usd": 0.0,
    "latency_ms": 0
  }
}
```

Qaydalar:
- `run_id` bir tam dövrəni birləşdirir (bir məhsul və ya bir video).
- `idempotency_key` eyni addımın iki dəfə icra olunmasının qarşısını alır (xüsusən Gumroad publish və YouTube upload).
- `org` sahəsi runner tərəfindən yoxlanılır: `ORG=studio` prosesi `org: "youtube"` mesajını qəbul etmir.

## 2.3. Pipeline tərifi (deklarativ)

Agentlər "növbəti agenti işə salmır" — onlar sadəcə output qaytarır. **Router** output-un `status` və məzmununa baxıb növbəti addımı seçir. Bu, dövrəni test etməyi və dəyişməyi asanlaşdırır.

```python
# orgs/studio/pipeline.py
from core.pipeline import Step, Pipeline

STUDIO = Pipeline(
    name="studio_daily",
    start="ceo.plan",
    steps={
        "ceo.plan":        Step(agent="ceo",        mode="plan",    next=lambda o, s: "tools.collect_signals"),
        "tools.collect_signals": Step(tool="collect_market_signals", next=lambda o, s: "research"),
        "research":        Step(agent="research",   next=lambda o, s: "ceo.decide"),
        "ceo.decide":      Step(agent="ceo",        mode="decide",  next=lambda o, s: "content.listing"),
        "content.listing": Step(agent="content",    mode="listing", next=lambda o, s: "content.section"),
        "content.section": Step(agent="content",    mode="section", fan_out="product_spec.outline",
                                next=lambda o, s: "tools.build_assets"),
        "tools.build_assets": Step(tool="build_product_files", next=lambda o, s: "philosopher.review"),
        "philosopher.review": Step(agent="philosopher", mode="review", next=route_after_review),
        "banker.pricing":  Step(agent="banker",     mode="pricing", next=lambda o, s: "tools.publish"),
        "tools.publish":   Step(tool="gumroad_publish", idempotent=True, next=lambda o, s: "tools.notify"),
        "tools.notify":    Step(tool="whatsapp_send", next=lambda o, s: None),
    },
)

def route_after_review(output: dict, state: dict) -> str | None:
    decision = output["decision"]
    if decision == "approve":
        return "banker.pricing"
    if decision == "revise" and state["revision_round"] < 2:
        state["revision_round"] += 1
        state["revision_notes"] = output["revision_notes"]
        return "content.section"          # yalnız problemli bölmələr yenidən yazılır
    return "tools.notify_rejection"
```

Ayrı, müstəqil kiçik pipeline-lar:

| Pipeline | Trigger | Addımlar |
|----------|---------|----------|
| `studio_daily` | cron 06:00 UTC | yuxarıdakı |
| `studio_sales_report` | cron 20:00 UTC + Gumroad ping webhook | `tools.fetch_sales → tools.compute_ledger → banker.report → tools.whatsapp_send` |
| `studio_weekly_reflect` | Bazar 18:00 | `tools.weekly_metrics → philosopher.reflect → tools.save_directives` |
| `youtube_daily` | cron 08:00 UTC (throttle varsa gün aşırı) | `tools.collect_yt_signals → trend_scout → script_writer → media_producer.plan → tools.render → tools.qc_measure → media_producer.qc → seo_upload → tools.youtube_upload → tools.whatsapp_send` |
| `youtube_weekly_growth` | Bazar ertəsi 07:00 | `tools.fetch_yt_analytics → tools.compute_costs → growth_banker → tools.save_directives → tools.whatsapp_send` |

## 2.4. Runner (orkestrasiya dövrəsi)

```python
# core/runner.py
import time, json, logging
from core.db import JobStore
from core.envelope import Envelope, new_envelope
from core.agents import AgentRegistry
from core.tools import ToolRegistry
from core.guards import BudgetGuard, KillSwitch

log = logging.getLogger("runner")

class Runner:
    def __init__(self, org: str, pipelines: dict, store: JobStore,
                 agents: AgentRegistry, tools: ToolRegistry,
                 budget: BudgetGuard, kill: KillSwitch):
        self.org, self.pipelines, self.store = org, pipelines, store
        self.agents, self.tools, self.budget, self.kill = agents, tools, budget, kill

    def start_run(self, pipeline_name: str, initial_payload: dict) -> str:
        p = self.pipelines[pipeline_name]
        run_id = self.store.create_run(self.org, pipeline_name, state={"revision_round": 0})
        self.store.enqueue(new_envelope(self.org, run_id, step=p.start,
                                        from_agent="scheduler", payload=initial_payload))
        return run_id

    def tick(self) -> bool:
        """Növbədən bir iş götürür və icra edir. İş yoxdursa False."""
        if self.kill.is_active():
            return False
        job = self.store.claim_next(self.org)            # SELECT ... FOR UPDATE / status='queued' → 'running'
        if job is None:
            return False
        env: Envelope = job.envelope
        assert env.org == self.org, "cross-org message rejected"

        run = self.store.get_run(env.run_id)
        pipeline = self.pipelines[run.pipeline]
        step = pipeline.steps[env.step]

        if step.idempotent and self.store.has_completed(env.idempotency_key):
            log.info("skip duplicate %s", env.idempotency_key)
            self.store.complete(job, output=self.store.get_output(env.idempotency_key))
            return True

        try:
            self.budget.check(self.org)                  # günlük LLM/API limitini aşıbsa BudgetExceeded
            if step.agent:
                output, meta = self.agents.call(step.agent, mode=step.mode,
                                                payload=env.payload, context=env.context,
                                                state=run.state)
            else:
                output, meta = self.tools.call(step.tool, payload=env.payload, state=run.state)
            self.budget.record(self.org, meta.get("cost_usd", 0.0))
        except Exception as exc:                         # şəbəkə, 5xx, validasiya
            return self._handle_failure(job, env, exc)

        status = output.get("status", "ok")
        if status == "retry" or status == "needs_input":
            return self._handle_failure(job, env, RuntimeError(status))
        if status == "rejected":
            self.store.complete(job, output, meta)
            self.store.finish_run(env.run_id, "rejected", reason=output.get("errors"))
            self._notify(f"[{self.org}] run {env.run_id} dayandırıldı: {output.get('errors')}")
            return True

        self.store.complete(job, output, meta)
        next_step = step.next(output, run.state)
        self.store.save_state(env.run_id, run.state)

        if next_step is None:
            self.store.finish_run(env.run_id, "done")
            return True

        for child_payload in self._build_next_payloads(pipeline, next_step, output, run):
            self.store.enqueue(new_envelope(self.org, env.run_id, step=next_step,
                                            from_agent=step.agent or step.tool,
                                            payload=child_payload, context=env.context))
        return True

    def _handle_failure(self, job, env, exc) -> bool:
        if env.attempt >= 3:
            self.store.fail(job, str(exc))
            self.store.finish_run(env.run_id, "failed", reason=str(exc))
            self._notify(f"[{self.org}] {env.step} 3 cəhddən sonra uğursuz: {exc}")
            self.kill.record_failure(self.org)           # 24 saatda 5 uğursuz run → kill switch
        else:
            delay = 60 * (4 ** (env.attempt - 1))        # 1 dəq, 4 dəq, 16 dəq
            self.store.retry(job, delay_s=delay, attempt=env.attempt + 1)
        return True

    def _build_next_payloads(self, pipeline, next_step, output, run):
        """Növbəti agentin input-unu yığır. fan_out olan addım üçün bir neçə payload qaytarır."""
        builder = pipeline.payload_builders[next_step]   # hər addım üçün ayrıca funksiya
        return builder(output, run.state, self.store.outputs_of(run.id))

    def _notify(self, text: str):
        self.tools.call("whatsapp_send", payload={"text": text}, state={})
```

**Payload builder** nümunəsi — agent output-unun hansı hissəsinin növbəti agentə keçdiyini açıq şəkildə təyin edir:

```python
# orgs/studio/payloads.py
def for_content_section(output, state, outputs):
    spec = outputs["ceo.decide"]["product_spec"]
    sections = state.get("sections_to_redo") or range(len(spec["outline"]))
    return [{
        "product_spec": spec,
        "build_step": "section",
        "section_index": i,
        "previous_sections_summary": state.get("summary_until", {}).get(str(i), ""),
        "revision_notes": state.get("revision_notes"),
    } for i in sections]
```

Fan-out addımlarında (`content.section`) bütün uşaq işlər bitəndən sonra növbəti addım bir dəfə yaradılır: `JobStore` hər `(run_id, step)` üçün gözlənilən və bitmiş say saxlayır (`join` sayğacı).

## 2.5. Agent çağırışı və JSON validasiyası

```python
# core/agents.py
import json
from pydantic import ValidationError
from core.llm import LLMClient
from core.prompts import load_prompt

class AgentRegistry:
    def __init__(self, org: str, llm: LLMClient, schemas: dict, models: dict):
        self.org, self.llm, self.schemas, self.models = org, llm, schemas, models

    def call(self, agent: str, mode: str | None, payload: dict, context: dict, state: dict):
        system = load_prompt("_common") + "\n\n" + load_prompt(f"{self.org}/{agent}")
        schema = self.schemas[(agent, mode)]           # Pydantic model
        user_msg = json.dumps({"context": context, "payload": {**payload, "mode": mode}},
                              ensure_ascii=False)
        messages = [{"role": "user", "content": user_msg}]
        total_meta = {"cost_usd": 0.0, "input_tokens": 0, "output_tokens": 0}

        for attempt in range(3):
            text, meta = self.llm.complete(model=self.models[agent], system=system,
                                           messages=messages, max_tokens=8000)
            for k in total_meta: total_meta[k] += meta[k]
            try:
                data = json.loads(_strip_fences(text))
                return schema.model_validate(data).model_dump(), total_meta
            except (json.JSONDecodeError, ValidationError) as e:
                messages += [{"role": "assistant", "content": text},
                             {"role": "user", "content":
                              f"Your previous output failed validation: {e}. Return corrected JSON only."}]
        raise ValueError(f"{agent}: invalid JSON after 3 attempts")

def _strip_fences(t: str) -> str:
    t = t.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1].rsplit("```", 1)[0]
    return t
```

Pydantic sxem nümunəsi:

```python
# orgs/studio/schemas.py
from typing import Literal
from pydantic import BaseModel, Field, conlist

class Base(BaseModel):
    model_config = {"extra": "forbid"}
    status: Literal["ok", "needs_input", "rejected", "retry"]
    errors: list[str] = []
    confidence: float = Field(ge=0, le=1)

class PhilosopherScores(BaseModel):
    buyer_value: float; promise_match: float; originality: float
    policy_risk: float; craft: float

class PhilosopherReview(Base):
    mode: Literal["review"]
    scores: PhilosopherScores
    decision: Literal["approve", "revise", "reject"]
    revision_notes: list[str]
    blocking_issues: list[str]
```

## 2.6. Flask tətbiqi

```python
# app.py
import os, hmac
from flask import Flask, request, jsonify, abort
from core.bootstrap import build_runtime

ORG = os.environ["ORG"]                     # "studio" və ya "youtube"
app = Flask(__name__)
rt = build_runtime(ORG)                     # store, runner, scheduler, guards

@app.get("/health")
def health():
    return jsonify(org=ORG, queue=rt.store.queue_depth(ORG),
                   kill_switch=rt.kill.is_active(), last_run=rt.store.last_run(ORG))

@app.post("/webhooks/gumroad/<secret>")      # Gumroad ping imza vermir → URL-də gizli token
def gumroad_ping(secret):
    if ORG != "studio" or not hmac.compare_digest(secret, os.environ["GUMROAD_PING_SECRET"]):
        abort(404)
    sale = request.form.to_dict()
    if rt.store.record_sale(sale):          # sale_id ilə dedup
        rt.runner.start_run("studio_sales_report", {"trigger": "sale", "sale_id": sale.get("sale_id")})
    return "", 200

@app.post("/admin/run/<pipeline>")
def manual_run(pipeline):
    if request.headers.get("X-Admin-Token") != os.environ["ADMIN_TOKEN"]:
        abort(401)
    return jsonify(run_id=rt.runner.start_run(pipeline, request.json or {}))

@app.post("/admin/kill")
def kill():
    if request.headers.get("X-Admin-Token") != os.environ["ADMIN_TOKEN"]:
        abort(401)
    rt.kill.activate(ORG, reason="manual")
    return jsonify(ok=True)

if __name__ == "__main__":
    rt.start_background()                   # scheduler + worker thread (runner.tick loop)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
```

Worker dövrəsi:

```python
# core/bootstrap.py (fraqment)
import threading, time
def _worker_loop(runner):
    while True:
        worked = runner.tick()
        time.sleep(0.2 if worked else 2.0)

def start_background(self):
    self.scheduler.start()
    threading.Thread(target=_worker_loop, args=(self.runner,), daemon=True).start()
```

Qeyd: Production-da `gunicorn` istifadə edəcəksənsə, worker və scheduler-i **ayrı prosesdə** (`python worker.py`) işlət, yoxsa hər gunicorn worker öz scheduler-ini açar və işlər təkrarlanar. Replit-də ən sadə variant: bir proses, `python app.py`.

## 2.7. Verilənlər bazası sxemi

```sql
CREATE TABLE runs (
  id TEXT PRIMARY KEY, org TEXT NOT NULL, pipeline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',          -- running|done|failed|rejected
  state_json TEXT NOT NULL DEFAULT '{}', reason TEXT,
  created_at TEXT NOT NULL, finished_at TEXT
);
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, org TEXT NOT NULL, run_id TEXT NOT NULL,
  step TEXT NOT NULL, envelope_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',           -- queued|running|done|failed
  attempt INTEGER NOT NULL DEFAULT 1, run_after TEXT NOT NULL,
  output_json TEXT, meta_json TEXT, error TEXT, idempotency_key TEXT UNIQUE
);
CREATE INDEX jobs_claim ON jobs(org, status, run_after);
CREATE TABLE ledger (                              -- yalnız studio DB-də
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,   -- sale|refund|fee|llm_cost|api_cost
  amount_usd REAL NOT NULL, ref TEXT UNIQUE, product_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE products (id TEXT PRIMARY KEY, run_id TEXT, name TEXT, topic_key TEXT UNIQUE,
  price_usd REAL, gumroad_url TEXT, status TEXT, created_at TEXT);
CREATE TABLE videos (id TEXT PRIMARY KEY, run_id TEXT, title TEXT, topic_key TEXT UNIQUE,
  youtube_video_id TEXT, publish_at TEXT, status TEXT, created_at TEXT);
CREATE TABLE directives (org TEXT, target_agent TEXT, text TEXT, created_at TEXT, expires_at TEXT);
CREATE TABLE budget_daily (org TEXT, day TEXT, spent_usd REAL, PRIMARY KEY (org, day));
```

## 2.8. Qoruyucu mexanizmlər (zero-touch üçün məcburi)

| Mexanizm | Necə işləyir |
|----------|--------------|
| BudgetGuard | `DAILY_BUDGET_USD` env. Hər LLM/API çağırışından sonra `budget_daily`-yə yazılır. Limit aşılırsa, run `rejected`, WhatsApp xəbərdarlığı |
| KillSwitch | 24 saatda 5 uğursuz run və ya Banker/Growth Banker `alert_level: critical` → təşkilat dayanır, yalnız `/admin/kill` reset ilə açılır. Hesabatlar işləməyə davam edir |
| Idempotency | Publish və upload addımları `idempotency_key` ilə; Gumroad-da `custom_permalink`, YouTube-da `topic_key` unikallığı |
| Dedup | `products.topic_key` və `videos.topic_key` UNIQUE — eyni mövzu iki dəfə çıxmır |
| Quality gate | Philosopher `approve` olmadan Gumroad-a heç nə getmir; Media Producer QC `pass` olmadan YouTube-a heç nə getmir |
| Rate limit | `tools/` qatında hər xarici API üçün token-bucket (Gumroad, YouTube kvotası, WhatsApp) |
| Secrets | Yalnız Replit Secrets. Kodda və DB-də açar yoxdur. Log-larda açarlar maskalanır |
| Audit | Hər envelope `jobs` cədvəlində qalır → istənilən run-ı addım-addım replay etmək olar (`scripts/replay.py <run_id>`) |

## 2.9. İzolyasiya modeli

```
Replit Project A: zt-studio            Replit Project B: zt-youtube
  ORG=studio                             ORG=youtube
  DB: data/studio.db                     DB: data/youtube.db
  Secrets: ANTHROPIC_API_KEY_STUDIO,     Secrets: ANTHROPIC_API_KEY_YT,
           GUMROAD_ACCESS_TOKEN,                  YT_CLIENT_ID/SECRET/REFRESH_TOKEN,
           WHATSAPP_*                             TTS/MEDIA API keys, WHATSAPP_*
  orgs/studio/ yüklənir                  orgs/youtube/ yüklənir
          \                                     /
           \___ eyni git repo, eyni core/ ____/
```

- `core/bootstrap.py` yalnız `orgs/{ORG}/` modulunu import edir; digər təşkilatın kodu heç yüklənmir.
- Hər təşkilatın ayrıca Anthropic API açarı var → xərclər Console-da ayrıca görünür və birinin limiti digərini bloklamır.
- WhatsApp mesajları prefikslə gedir: `[STUDIO]` və `[YOUTUBE]`.

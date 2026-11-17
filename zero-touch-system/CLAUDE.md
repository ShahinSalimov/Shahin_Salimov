# Zero-Touch System — rules for Claude Code

- Python 3.12, Flask, Pydantic v2, APScheduler, SQLite (WAL). No Celery/Redis.
- Two orgs: studio and youtube. Code under orgs/<org>/ must never import from the other org. core/ must not import from orgs/ (except core/bootstrap.py, which imports only orgs/<ORG> dynamically).
- Agents never call each other. Agents return JSON; core/runner.py routes.
- Every agent output is validated by a Pydantic model with extra="forbid".
- Money and metrics are computed in code (ledger.py, yt_analytics.py), never by the LLM.
- All external APIs go through orgs/<org>/tools/ adapters and are mocked in tests. Tests must pass offline.
- Never hardcode secrets. Read from env via core/config.py. Never log secrets.
- Model ids come from env (LLM_MODEL_HEAVY, LLM_MODEL_LIGHT).
- Prompts live in prompts/ and start with a "version: x.y.z" line. Bump the version on every prompt change.
- Spec documents: ../zero-touch/01-agent-system-prompts.md, ../zero-touch/02-orchestration-architecture.md, ../zero-touch/03-prd-claude-code.md.
- Before claiming a task is done: run `pytest -q` and `python scripts/dry_run.py --org studio` and `--org youtube`.

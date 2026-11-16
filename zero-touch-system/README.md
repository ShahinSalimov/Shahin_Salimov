# zero-touch-system

Two isolated autonomous organizations on one codebase:

- `ORG=studio` — digital product studio on Gumroad (CEO, Research, Content, Philosopher, Banker)
- `ORG=youtube` — YouTube automation agency (Trend Scout, Script Writer, Media Producer, SEO & Upload, Growth Banker)

Spec: [`../zero-touch/`](../zero-touch/README.md). Build stages: `../zero-touch/03-prd-claude-code.md` section 3.3.

Status: Stage 3 done — runner (retry, fan-out, revision rounds), budget guard, kill switch, WhatsApp adapter, scheduler and Flask app (tests green). Stage 4 next.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python -m pytest
ORG=studio .venv/bin/python app.py    # GET /health on port 8080
```

Admin endpoints (header `X-Admin-Token: $ADMIN_TOKEN`):
`POST /admin/run/<pipeline>`, `GET /admin/runs/<run_id>`, `POST /admin/kill`, `DELETE /admin/kill`.

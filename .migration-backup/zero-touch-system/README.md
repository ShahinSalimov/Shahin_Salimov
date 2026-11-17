# zero-touch-system

Two isolated autonomous organizations on one codebase:

- `ORG=studio` — digital product studio on Gumroad (CEO, Research, Content, Philosopher, Banker)
- `ORG=youtube` — YouTube automation agency (Trend Scout, Script Writer, Media Producer, SEO & Upload, Growth Banker)

Spec: [`../zero-touch/`](../zero-touch/README.md). Build stages: `../zero-touch/03-prd-claude-code.md` section 3.3.

Status: Stages 0–6 done — both orgs implemented, JSON logging with secret masking, replay, backups, isolation tests, CI and deploy guide. Next: the one-time live launch in [DEPLOY.md](DEPLOY.md) (Stage 7).

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python -m pytest
ORG=studio .venv/bin/python app.py    # GET /health on port 8080
.venv/bin/python scripts/dry_run.py --org studio   # full offline run, no API calls
.venv/bin/python scripts/dry_run.py --org youtube  # renders a real MP4 with fake voice/images (needs ffmpeg)
```

Admin endpoints (header `X-Admin-Token: $ADMIN_TOKEN`):
`POST /admin/run/<pipeline>`, `GET /admin/runs/<run_id>`, `POST /admin/kill`, `DELETE /admin/kill`, `GET /admin/backup`.

Replay a past run from the database: `.venv/bin/python scripts/replay.py --org studio [<run_id>] [--full]`.

Deployment (Replit Reserved VM, Gumroad ping, Twilio WhatsApp, YouTube OAuth): see [DEPLOY.md](DEPLOY.md).

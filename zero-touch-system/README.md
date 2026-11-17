# zero-touch-system

Two isolated autonomous organizations on one codebase:

- `ORG=studio` — digital product studio on Gumroad (CEO, Research, Content, Philosopher, Banker)
- `ORG=youtube` — YouTube automation agency (Trend Scout, Script Writer, Media Producer, SEO & Upload, Growth Banker)

Spec: [`../zero-touch/`](../zero-touch/README.md). Build stages: `../zero-touch/03-prd-claude-code.md` section 3.3.

Status: Stage 5 done — youtube org: signals, script, TTS, ffmpeg render with burned subtitles, QC gate, scheduled private upload, analytics and growth loop, dry run (tests green). Stage 6 next.

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
`POST /admin/run/<pipeline>`, `GET /admin/runs/<run_id>`, `POST /admin/kill`, `DELETE /admin/kill`.

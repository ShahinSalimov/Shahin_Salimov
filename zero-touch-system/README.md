# zero-touch-system

Two isolated autonomous organizations on one codebase:

- `ORG=studio` — digital product studio on Gumroad (CEO, Research, Content, Philosopher, Banker)
- `ORG=youtube` — YouTube automation agency (Trend Scout, Script Writer, Media Producer, SEO & Upload, Growth Banker)

Spec: [`../zero-touch/`](../zero-touch/README.md). Build stages: `../zero-touch/03-prd-claude-code.md` section 3.3.

Status: Stage 1 done — envelope, pipeline definitions and SQLite JobStore (tests green). Stage 2 next.

```bash
pip install -r requirements.txt
cp .env.example .env
pytest
```

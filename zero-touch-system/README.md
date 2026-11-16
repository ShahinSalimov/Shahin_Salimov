# zero-touch-system

Two isolated autonomous organizations on one codebase:

- `ORG=studio` — digital product studio on Gumroad (CEO, Research, Content, Philosopher, Banker)
- `ORG=youtube` — YouTube automation agency (Trend Scout, Script Writer, Media Producer, SEO & Upload, Growth Banker)

Spec: [`../zero-touch/`](../zero-touch/README.md). Build stages: `../zero-touch/03-prd-claude-code.md` section 3.3.

Status: Stage 2 done — LLM client, agent JSON validation and 15 agent output schemas (tests green). Stage 3 next.

```bash
pip install -r requirements.txt
cp .env.example .env
pytest
```

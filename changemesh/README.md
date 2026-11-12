# CHANGEMESH

**Every change. Every connection. One control center.**

CHANGEMESH is a B2B SaaS for business change management. When one piece of business information changes — a menu price, opening hours, an address, a product spec — it finds every website page, PDF, spreadsheet, catalog and marketing document that carries the same information, explains the impact and routes the updates through approval. Nothing external is ever modified without explicit approval, and every step is audited.

> **Status:** Stages 1–7 complete; Stage 8 (production-readiness audit) done with open items. The code is **not yet verified against a real Supabase project or a real Stripe test account** — see [TEST_REPORT.md](./TEST_REPORT.md) and [DEVELOPMENT_STATUS.md](./DEVELOPMENT_STATUS.md) before deploying.

## What it does

| Area | Highlights |
|---|---|
| Asset intelligence | Register websites, PDFs, CSVs, catalogs and manual records; SSRF-safe website fetch; text/CSV/JSON-LD/HTML extraction into facts with source locations; version history |
| Dependency graph | Rule-based relationship suggestions from shared facts, human review, interactive graph with depth highlighting, inconsistency detection |
| Change engine | Detects changes between versions, rule-based impact analysis (optional, clearly labeled Claude-assisted analysis), impact graph, update proposals |
| Approvals & updates | Approve / reject / request revision, revision loop, admin-only execution with idempotency, manual confirmation and rollback, history, CSV/Markdown export |
| Commercial | Plan limits enforced in the database, Stripe test-mode checkout + signed webhooks, invitations, notifications, API keys + REST API, usage metering, platform admin |
| Security | Supabase Auth, Postgres Row Level Security on every table, composite tenant keys, append-only audit log, CSP, rate limits |

## Documentation

| File | Contents |
|---|---|
| [PRODUCT_OVERVIEW.md](./PRODUCT_OVERVIEW.md) | The product for non-engineers: problem, users, workflow, plans |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Stack, module layout, tenancy & security model, database, engines |
| [INSTALLATION.md](./INSTALLATION.md) | Local setup, Supabase, Stripe test mode, running checks |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Production deployment steps and launch checklist |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | Every environment variable |
| [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) | REST API v1 and the Stripe webhook |
| [TEST_REPORT.md](./TEST_REPORT.md) | What was tested, results, what was not tested |
| [DEVELOPMENT_STATUS.md](./DEVELOPMENT_STATUS.md) | Stage progress, known issues, unfinished features |

## Quick start (demo mode, no accounts needed)

```bash
cd changemesh
npm install
cp .env.example .env.local   # demo mode is enabled in the example file
npm run dev
```

Open http://localhost:3000 and click **Explore the demo** — a fictional restaurant group ("Harbor & Vine Hospitality") with 15 interconnected assets, open changes and pending approvals. Demo data lives only in server memory for that browser session.

## Tech stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, RLS) · Stripe (test mode) · React Flow · Zod · Vitest · Playwright.

# CHANGEMESH — Architecture & Development Plan

> Status: **proposal, pending approval.** No application code exists yet.
> Tagline: *Every change. Every connection. One control center.*

## 1. Repository today

| Path | What it is | Decision |
|---|---|---|
| `README.md` | GitHub profile README | Leave untouched |
| `.claude/skills/*` | Video-editing / motion skills | Leave untouched |
| `adscript-studio/` | Working Next.js 16 + Supabase + Claude SaaS (credits, Gumroad) | Leave untouched; reuse its proven patterns |
| `.github/workflows/adscript-studio.yml` | CI scoped to `adscript-studio/**` | Leave untouched; add a sibling workflow |

CHANGEMESH lives in a new top-level folder, `changemesh/`, with its own `package.json`, CI workflow and deploy target. Nothing existing is modified.

Patterns carried over from `adscript-studio`: Next.js App Router, TypeScript strict, Tailwind 4, Supabase SSR auth with `proxy.ts`, `requireEnv()` config, Zod validation, Vitest, service-role client confined to `server-only` modules.

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Web app | Next.js 16 (App Router, Server Components, Server Actions, Route Handlers) | Same as existing app; one deployable |
| Language | TypeScript `strict` + `noUncheckedIndexedAccess` | Spec requirement |
| UI | Tailwind 4 + own component kit built on Radix primitives | Accessible primitives, premium custom look (not a stock template) |
| Graph view | `@xyflow/react` (React Flow) + `elkjs` auto-layout | Interactive, handles hundreds of nodes |
| Charts | Recharts or hand-built SVG | Dashboard KPIs |
| Auth | Supabase Auth (email magic link + Google OAuth) | Already proven in repo |
| Database | Supabase Postgres, **Row Level Security on every tenant table** | Tenant isolation enforced in the DB, not only in code |
| Migrations | Supabase CLI: `supabase/migrations/*.sql`, generated TS types | Versioned, reproducible |
| File storage | Supabase Storage, private bucket, path `workspace_id/asset_id/...`, signed URLs | Documents never public |
| PDF text | `unpdf` (server-side) | Pure JS, no native deps |
| CSV | `papaparse` | Streaming, header detection |
| HTML → text | `linkedom` / `cheerio` | Server-side, no browser needed |
| AI (optional) | Claude via `@anthropic-ai/sdk`, structured outputs | Only when `ANTHROPIC_API_KEY` is set; never faked |
| i18n | `next-intl` (verify Next 16 compatibility in Phase 0; fallback: small typed `t()` layer). Catalogs: `en` (default), `az`, `tr` | Spec requirement |
| Logging | `pino` JSON logs with request ID + workspace ID, no PII/secrets | Spec requirement |
| Tests | Vitest (unit/domain), RLS integration tests against local Supabase, Playwright (E2E) | Spec requirement |
| CI | GitHub Actions: typecheck → lint → unit → RLS tests → build → E2E | |
| Billing (later) | Stripe Checkout + webhooks | Not in MVP |

## 3. Module layout

```
changemesh/
  src/
    app/
      (marketing)/            landing, pricing, legal
      (auth)/login, auth/callback
      (app)/w/[workspaceSlug]/
        dashboard/
        assets/  assets/[id]/
        graph/
        changes/  changes/new/  changes/[id]/
        approvals/
        history/
        integrations/
        settings/team/  settings/workspace/  settings/billing/
      api/                    route handlers (uploads, scan trigger, webhooks)
    domain/                   PURE TypeScript, no I/O — fully unit-tested
      graph/                  build graph, traversal, impact scoring
      impact/                 impact analysis
      conflicts/              conflict detection
      extraction/             rule-based extractors (price, hours, phone, address, email)
      rbac/                   role → permission matrix
    server/                   I/O layer ("server-only")
      db/                     typed repositories (Supabase client, RLS-aware)
      scan/                   URL fetcher (SSRF-safe), PDF/CSV parsers
      ai/                     ExtractionProvider interface: RuleProvider, ClaudeProvider
      audit/                  audit log writer
      storage/
    components/ui/            design-system kit (Button, Card, Badge, DataTable, Dialog…)
    components/features/      feature components (GraphCanvas, ImpactList, ApprovalPanel…)
    i18n/  messages/{en,az,tr}.json
  supabase/migrations/  supabase/seed/demo.sql
  tests/  e2e/
```

Rule: `domain/` never imports from `server/` or `app/`. Business logic stays testable without a database.

## 4. Data model (core tables)

All tenant tables carry `workspace_id` and RLS policy `is_member(workspace_id)`; writes additionally check role.

| Table | Purpose |
|---|---|
| `workspaces` | Tenant. `is_demo` flag |
| `memberships` | user × workspace × role (`owner`, `admin`, `editor`, `approver`, `viewer`) |
| `invitations` | Pending team invites (token hash, expiry) |
| `assets` | `type`: `website_page`, `pdf`, `csv`, `manual`, `external_system` (placeholder). Name, URL/storage path, owner, `is_demo` |
| `asset_scans` | One row per scan: `queued/running/succeeded/partial/failed`, error message, extractor used, started/finished, content hash |
| `entities` | A business "thing": *Menu item: Classic Burger*, *Location: Downtown* |
| `facts` | An attribute of an entity with a canonical value: *Classic Burger → price = 12.00 USD* |
| `fact_occurrences` | Where a fact appears: fact × asset, observed value, location (CSS path / PDF page / CSV row+col), `source` (`manual`, `rule`, `ai`, `demo`), confidence, `confirmed_by` |
| `asset_relationships` | Asset → asset edges: `derived_from`, `embeds`, `links_to`, `syncs_with` |
| `changes` | Change request: fact, old → new value, reason, status (`draft → pending_approval → approved/rejected → in_progress → completed`) |
| `impact_items` | Snapshot of the impact analysis for a change: occurrence, depth, severity, reason path |
| `update_tasks` | Suggested update per impacted occurrence: instructions, status (`suggested → approved/rejected → applied/skipped`), `applied_by`, evidence |
| `approvals` | Decision records: who, when, decision, comment |
| `audit_events` | **Append-only** (no UPDATE/DELETE grants): actor, action, target, before/after JSON, request ID |
| `integrations` | Connector config; status starts as `not_connected`. Secrets stored encrypted, never sent to client |

## 5. How the core engine works

**Graph.** Nodes = entities, facts, assets. Edges = `fact_occurrences` (fact ↔ asset) and `asset_relationships` (asset ↔ asset).

**Impact analysis** (`domain/impact`), deterministic and explainable:
1. Start from the changed fact.
2. Direct impact: every asset with an occurrence of that fact (depth 1).
3. Indirect impact: BFS over `asset_relationships` (e.g. PDF menu `derived_from` Google Sheet; homepage `embeds` menu page), bounded depth, cycle-safe.
4. Score each item: `severity = f(asset type, depth, occurrence confidence, customer-facing flag)`.
5. Every item stores its **reason path** ("Price → appears in *Menu PDF p.2* → *Menu PDF* derived from *Prices.csv*"), so the UI can show *why*.

**Conflict detection** (`domain/conflicts`): for each fact, group occurrences by normalized value (currency, number, time formats normalized). More than one distinct value = conflict, shown on the dashboard and on the fact.

**Extraction.** `ExtractionProvider` interface:
- `RuleProvider` (always on): regex/heuristics for prices, opening hours, phones, emails, addresses; CSV column mapping chosen by the user. Labeled **"Rule-based"**.
- `ClaudeProvider` (only if `ANTHROPIC_API_KEY` exists): returns candidates with confidence. Labeled **"AI-suggested"**.
- Neither creates confirmed facts silently: extracted candidates go to a **review queue**; the user confirms, edits or discards. Low-confidence or failed parts are shown as such.

**Scanning (websites).** Server-side fetch with SSRF protection (resolve DNS, block private/loopback/link-local ranges, http/https only, redirect limit, 10 s timeout, 5 MB cap, `text/html` only), honest status per scan (`failed` with the real reason, `partial` when content was truncated or some pages failed). MVP: single URL per asset, manual "Rescan"; crawling and schedules come later.

**Updates.** The MVP **never writes to external systems**. An approved change produces update tasks with exact instructions (where, old → new). Users mark tasks applied; a rescan can verify the new value appears. Write-back connectors come later and will reuse the same approval gate.

## 6. Security & tenancy

- RLS on every tenant table + DB-level tests proving user A cannot read/write workspace B.
- RBAC matrix in `domain/rbac`, enforced in Server Actions **and** RLS (defense in depth).
- Zod validation on every Server Action / Route Handler input.
- Service-role key only in `server-only` modules, used for audit writes and scan workers.
- Uploads: MIME + magic-byte check, size limit, private bucket, short-lived signed URLs.
- Secrets only from env (`.env.example` documents names, no values). Integration tokens encrypted at rest.
- Security headers + CSP in `next.config.ts`; rate limits on auth, upload and scan endpoints.

### Role matrix (MVP)

| Action | owner | admin | editor | approver | viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| View workspace data | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create/edit assets, facts, relationships | ✓ | ✓ | ✓ | – | – |
| Create change requests | ✓ | ✓ | ✓ | – | – |
| Approve / reject changes & updates | ✓ | ✓ | – | ✓ | – |
| Manage team | ✓ | ✓ | – | – | – |
| Billing, delete workspace | ✓ | – | – | – | – |

A user cannot approve a change they created (separation of duties; configurable later).

## 7. Demo mode

- "Try demo" creates a separate workspace with `is_demo = true`, seeded with a fictional restaurant chain (*Harbor & Vine*: 3 locations, website pages, PDF menu, price CSV, catalog).
- A persistent banner: **"Demo workspace — sample data. No real scans or AI analysis."**
- Demo occurrences carry `source = 'demo'` and render with a *Sample data* badge, never as AI output.
- Demo workspaces cannot trigger external fetches or AI calls.

## 8. Design system

- Neutral graphite base, one accent color, semantic status colors (in sync / outdated / conflict / pending / failed), each also paired with icon + label (not color alone).
- Type: Inter (UI) + JetBrains Mono (values, IDs). 4-pt spacing scale, 8–12 px radii, subtle 1 px borders over heavy shadows.
- Dark and light themes via CSS tokens; system preference default, user override persisted.
- Motion: 150–200 ms ease-out, respects `prefers-reduced-motion`.
- WCAG 2.2 AA: keyboard navigation (incl. a list view equivalent of the graph), focus rings, aria labels.

## 9. Development plan (incremental)

Each phase ends with: typecheck clean, tests green, build passes, commit + push.

| Phase | Deliverable | Tests |
|---|---|---|
| **0. Foundation** | `changemesh/` scaffold, strict TS, Tailwind tokens, UI kit basics, i18n skeleton (en/az/tr), pino logger, env config, CI workflow | Config + i18n unit tests |
| **1. Auth & tenancy** | Login (magic link, Google), workspaces, memberships, RBAC, RLS, audit log foundation, app shell + navigation | RBAC unit tests, RLS isolation tests |
| **2. Assets** | Asset CRUD: manual records, URL registration, PDF upload, CSV import (with column mapping) | Parser + validation tests |
| **3. Scanning & extraction** | SSRF-safe URL scan, PDF text, rule extractors, scan status/errors, extraction review queue | Extractor tests, SSRF guard tests |
| **4. Facts & graph** | Entities/facts/occurrences, asset relationships UI, dependency graph view (+ accessible list view) | Graph builder tests |
| **5. Changes & impact** | Change creation, impact analysis with reason paths, conflict detection, suggested update tasks | Impact + conflict engine tests (core of the product) |
| **6. Approvals & history** | Approve/reject flow, update task tracking, change history timeline, audit log viewer | Workflow state-machine tests, E2E happy path |
| **7. Dashboard & demo** | KPI dashboard (open changes, conflicts, outdated assets, scan health), demo workspace seed + banner | E2E demo flow |
| **8. Optional AI** | `ClaudeProvider` behind env flag, clearly labeled, review-required | Provider contract tests with mocked SDK |
| **9. Hardening** | A11y audit, security headers/CSP, rate limits, error pages, docs | Playwright + axe |
| *Later* | Team invites by email, Stripe billing, admin dashboard, Google Sheets / WordPress / Shopify connectors, scheduled rescans, crawling | |

## 10. Open decisions

1. **Backend platform:** Supabase (recommended, already used in this repo) vs. self-hosted Postgres + Auth.js.
2. **Hosting:** Vercel (recommended) vs. other.
3. **AI provider in Phase 8:** Claude (recommended, SDK already in repo) vs. OpenAI.

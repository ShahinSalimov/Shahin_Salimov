# CHANGEMESH — Development Status

_Last updated: 2026-11-12 — after Stage 7 (Commercial SaaS)._

## Roadmap

| # | Stage | Status |
|---|---|---|
| 1 | **Foundation** — architecture, database, authentication | ✅ Complete |
| 2 | **Premium UI** — design system, application shell, all pages | ✅ Complete |
| 3 | **Asset Intelligence** — documents, websites, extraction | ✅ Complete |
| 4 | **Dependency Graph** — relationships between information | ✅ Complete |
| 5 | **AI Change Engine** — change detection, impact analysis | ✅ Complete |
| 6 | **Approval Engine** — approvals, update execution | ✅ Complete |
| 7 | **Commercial SaaS** — subscriptions, billing, roles, invitations | ✅ Complete |
| 8 | **Launch** — production-readiness audit, deploy, first customers | ⏳ In progress (authorized together with Stage 7) |

Stages 7 and 8 were authorized together ("Stage 7-8"). Stage 7 is committed separately before Stage 8 starts.

## Stage 7 — Commercial SaaS ✅

### Delivered
- **Plan limits in the database** (migration `20261112000800_commercial.sql`): `organization_limits()` + `enforce_plan_limits()` trigger. No live subscription ⇒ Starter (25 active assets, 1 workspace). Business 250 / 5, Agency 1,000 / unlimited, Enterprise custom (unlimited). Restoring an archived asset over the limit is refused too. Prices remain **proposed test prices**.
- **Stripe billing, test mode only**: live keys refused; Checkout (org owner/admin, workspace admin+) → Stripe-hosted page; success page states that the plan changes only after the webhook; Billing Portal for changes/cancel/invoices. `POST /api/webhooks/stripe`: signature verified on the raw body, live events refused, idempotent (`stripe_events`), out-of-order events ignored, subscription re-read from Stripe on checkout completion, unknown prices/orgs → 500 (Stripe retries, nothing granted).
- **Team invitations**: hashed one-time tokens, 7-day expiry, one open invitation per email, email-bound acceptance (`accept_invitation()`), revoke, owners-only for admin invites, `/invite/[token]` page; signup/login return to the invitation.
- **Notifications**: DB-trigger generated (approval needed, revision requested, update failed, scan failed, invitation accepted, payment problem); header bell with unread count, mark read / mark all read.
- **API keys + REST API v1**: hashed, scoped (read / read & write), expiring, revocable keys; `/api/v1/workspace|assets|changes|proposals` (GET) and `POST /api/v1/changes` (draft only, origin `api`); per-key rate limit; JSON errors without internals. `API_DOCUMENTATION.md`.
- **Usage metering**: `organization_usage()` (assets, workspaces, members, scans/failed scans and AI operations + estimated cost this month, connected integrations, active API keys); Usage tab separates enforced limits from metered quantities.
- **Organization settings**: rename, workspace list, create workspace (blocked with the reason at the plan limit or without org admin role).
- **RBAC additions**: `api_keys.manage`, `billing.manage` (admin); billing additionally requires organization owner/admin.
- **Platform admin** `/admin`: allow-listed emails only (404 otherwise); aggregate counts per organization, recent Stripe events; no tenant content.
- **Public pricing page** `/pricing` (linked from the landing page), labeled as test prices.
- **Security headers**: Content-Security-Policy and HSTS (production).
- **Audit**: invitations and API keys are audited (insert/update). Token and key hashes never enter the audit metadata.

### Verification (run 2026-11-12, in this environment)
| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` | ✅ 0 problems |
| `npm test` | ✅ 258/258 (31 files) — new: Stripe mapping, signed webhook (bad signature, idempotency, stale events, unmapped price → 500, live events refused), tokens, inputs, test-key guard |
| `npm run test:db` | ✅ 93/93 (8 files) — new `commercial.test.ts`: plan limits (assets, workspaces, restore, upgrade/cancel), invitations (admin-only, stamping, email match, expiry, revoke, single use, immutable token), notifications (recipients, own rows only, read_at only), API keys (admin-only, scopes, immutable hash, audit), stripe_events hidden, usage aggregates and outsider refusal |
| `npm run build` | ✅ production build (new routes: /pricing, /invite/[token], /admin, /api/v1/*, /api/webhooks/stripe, settings/organization|api|usage) |
| E2E `tests/e2e/demo-flows.cjs` | ✅ 68/68 against `next start` (new: notification bell + mark all read, demo refusals for invitations/API keys/checkout, usage, organization, pricing, API 401/503, unsigned webhook refused, /admin hidden) |
| Responsive sweep | ✅ 87 page/viewport combinations, no horizontal overflow or console errors |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |

### Known limitations / honest notes
- **Stripe was not called for real**: no Stripe test account/keys exist in this environment. The webhook path is tested with real Stripe signatures (`generateTestHeaderString`) against a fake database; Checkout/Portal session creation is untested end-to-end.
- **Supabase PostgREST path still not exercised end-to-end** (no Supabase/Docker here). All SQL is tested on PostgreSQL 16 with the Supabase shim; the TypeScript Supabase queries for invitations, API keys, notifications, usage and the REST API have not run against a real PostgREST.
- **No email delivery**: invitation links are copied manually by the admin (stated in the UI).
- REST API and per-key rate limit run with the service role; tenant isolation on this path depends on the `workspace_id` filter in each handler (reviewed, not DB-enforced). Rate limiting is in-memory per instance.
- CSP still allows `'unsafe-inline'` scripts (Next.js bootstrap); nonce-based CSP is a follow-up.
- Team size is metered, not limited (the brief defines no member cap). AI-operation counts are metered, not limited.
- Plan changes (upgrade/downgrade between paid plans) are delegated to the Stripe Billing Portal; its product configuration must be set up in the Stripe dashboard.

## Stage 6 — Approval & Update Management ✅

### Delivered

| Requirement | Implementation |
|---|---|
| Workflow 1–8 | change → impact analysis → proposals → review → approve / reject / request changes → execute where supported → results recorded → audit (triggers on proposals, approvals, executions) |
| Proposal contents | target asset, current value, proposed value, reason, evidence, impact level, approval status, execution status (+ idempotency reference, revisions, last result) |
| Approval statuses | Pending, Approved, Rejected, Needs Revision — with a revision loop (editor revises with a note → Pending) |
| Execution statuses | Not Started, Ready, In Progress, Completed, Failed |
| No automatic publishing | Approval only marks "Ready"; execution is an explicit admin action; external assets are confirmed manually |
| Permissions before execution | Server Action checks `proposals.execute` (admin+); the RPC checks again |
| Duplicate execution | Row lock + status check + partial unique index; completed updates cannot run again |
| Audit | Every execution, rollback and preview is a history row and an audit event |
| Rollback | Internal records: Undo (restores the previous value); manual confirmations: Reopen |
| Honest errors | Failures need a message; stuck executions are closed as "outcome unknown"; unexpected errors never report success |
| Idempotency keys | Immutable per proposal, reused on retries, passed to every executor, shown as a reference and in exports |
| Internal update simulator | Preview (dry run) with before → after and steps; InternalRecordExecutor really updates CHANGEMESH records |
| Exportable instructions | CSV (formula-safe) and Markdown, open or all proposals |
| Future integrations | `IntegrationConnector` contract and executor selection point; no connector implemented |
| UI | Approval Center tabs (Pending, Needs revision, Ready to apply, Completed, Rejected) with revise / preview / apply / retry / undo; All proposals; Update history with filters and exports |

New database objects (`…000700_update_execution.sql`): `update_executions`, `revision_count`, `execution_attempts`, `revise_update_proposal()`, `start_proposal_execution()`, `finish_proposal_execution()`, `refresh_change_status()`; `decide_update_proposal()` now marks approved proposals ready and updates the change status; the decision guard allows editors exactly one transition (needs_revision → pending).

### Verification (run 2026-11-12, in this environment)

| Check | Result |
|---|---|
| `npm run typecheck` / `npm run lint` | ✅ 0 errors / 0 problems |
| `npm test` (unit) | ✅ 30 files, 245 tests (+4 execution service, +3 export) |
| `npm run test:db` | ✅ 7 files, 74 tests (+13: revision loop, approval-before-execution, admin-only, duplicate prevention, retries with the same key, mandatory error messages, change status, rollback, stale executions, history/audit, simulation permissions, rejection) |
| `npm run build` | ✅ success |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| E2E demo flows | ✅ 56/56 (+10: ready tab, preview, note required, manual confirmation, no second run, reopen, revision, history, CSV and Markdown exports) |
| Responsive sweep (24 routes × 3 sizes) | ✅ 72 combinations, no errors, no overflow |

### Known limitations / honest notes

1. **No external system is updated by CHANGEMESH.** Websites, documents and catalogs are updated by people and confirmed; connectors (with the idempotency contract) are a later stage.
2. "Mark as applied" is a human confirmation; verification happens when the asset is rescanned or re-uploaded (the next analysis then skips it as "already shows the new value").
3. Only manual records are updated internally. Uploaded files are not rewritten (CHANGEMESH keeps the original as evidence).
4. No bulk approve/apply yet; each proposal is decided and applied individually.
5. No notifications (email/Slack) when proposals need review — planned with the commercial stage.

### Recommended next stage

**Stage 7 — Commercial SaaS:** organization management, plans and usage limits, Stripe test-mode billing with verified webhooks, invitations, notifications, API architecture, usage analytics and admin management.

## Stage 5 — Change Detection & Impact Analysis ✅

### Delivered

| Requirement | Implementation |
|---|---|
| 1–3 Register value, compare with previous version, identify the changed attribute | Register dialog reads the current value from the source asset; new scanned versions are diffed against the previous version (`diffFacts`) |
| 4 Related entities | Other attributes of the same entity are listed ("Related information") |
| 5–6 Connected assets, direct and indirect impact | Assets holding the same fact (direct) + dependents over relationships up to 4 hops (indirect), with paths |
| 7 Inconsistencies | "Unexpected value" flags per asset; "Detect inconsistencies" records outdated/conflicting facts across assets |
| 8 Impact report | Change Details: summary, before/after, impact graph, affected assets, reasons, recommendations, approval status |
| 9 Update proposals | Pending proposals for assets holding the value; re-analysis keeps decided ones |
| Change types | created, updated, deleted, conflicting, outdated |
| Impact result fields | affected asset, old value, new value, relationship path, impact level (critical/high/medium/low), confidence, recommended action |
| AI abstraction | Rule-based analyzer without keys (labeled "Rule-based · no AI"); Claude when configured; Zod-validated structured JSON; retries; per-call token and cost tracking (`ai_usage`, Billing page); AI cannot approve, publish or change the set of affected assets |

New database objects (`…000600_change_engine.sql`): `changes.analysis` / `analyzed_at`, `ai_usage` (insert/select only), `save_change_analysis()` RPC.

### Verification (run 2026-11-12, in this environment)

| Check | Result |
|---|---|
| `npm run typecheck` / `npm run lint` | ✅ 0 errors / 0 problems |
| `npm test` (unit) | ✅ 28 files, 238 tests (+17 change/impact domain, +9 AI layer with a mocked client, +5 engine integration) |
| `npm run test:db` | ✅ 6 files, 61 tests (+6: analysis save/replace, decided proposals kept, forged approval fields ignored, closed changes, ai_usage immutability and tenancy) |
| `npm run build` | ✅ success |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| E2E demo flows | ✅ 46/46 (+8: sample analysis label, re-run analysis, impact graph, recommendations and approval status, register value with automatic old value, pending proposals, inconsistency detection) |
| Responsive sweep | ✅ 66 combinations, no errors, no overflow |

Bugs found and fixed: connected-only assets received the "critical attribute" bonus (homepage became medium) → bonus only for assets that hold the fact.

### Known limitations / honest notes

1. **Claude was not called for real in this environment** (no API key; outbound access is restricted). The integration follows the SDK documentation and is tested with a mocked client: request shape, schema retries, refusals, rate limits, authentication errors, fallback pricing, guardrails.
2. Entity matching is exact after normalization: "Burgers" in a campaign does not match "Classic Burger"; such assets appear only when connected by relationships ("check" recommendations).
3. Automatically detected changes (new versions, inconsistencies) are analyzed with rules only, to avoid unplanned AI costs; AI can be applied with "Re-run analysis".
4. Cost figures are estimates from list prices (cached table in `src/server/ai/pricing.ts`); they are not invoices.
5. Registering a value does not modify the source asset's facts; the source changes when it is rescanned, re-uploaded or edited.


## Stage 4 — Dependency Graph ✅

### Delivered

| # | Requirement | Implementation |
|---|---|---|
| — | React Flow graph of entities, attributes, assets (documents, websites, products, marketing) | Custom entity, information and asset nodes; relationship, occurrence and attribute edges |
| 1 | Automatic relationship suggestions from extracted information | Rule-based engine with evidence notes; on demand and after every new scanned version |
| 2 | Confirm / reject | From the edge details panel, the asset page and the list view |
| 3 | Manual relationships | "Add relationship" dialog (type help text), confirmed immediately; remove with confirmation |
| 4 | Source and destination | Arrow from dependent to upstream; edge panel shows both ends |
| 5 | Relationship types | Shown on selection and in the list (derived from, embeds, links to, syncs with, references, duplicates) |
| 6 | Graph depth | Longest chain metric + dependency level per asset + hop distance in the details panel |
| 7 | Highlight connected assets | Neighborhood highlight with 1 / 2 / 3 / all hops |
| 8 | Filter by asset type | Toggle chips per type |
| 9 | Search nodes | Live search over assets, entities and attributes; Enter or "Show" focuses matches |
| 10 | Node details | Side panel for assets, information and entities |
| 11 | Zoom and pan | React Flow canvas, controls, minimap, Fit |
| 12 | Confidence | Edge thickness, % on selection, panel |
| 13 | Disconnected assets | "Not connected" column + metric (no link at all vs only suggested) |
| — | Graph service from database records | `buildDependencyGraph()` uses only assets, relationships and `current_facts`; nothing is drawn by hand |
| — | Demo workspace | Seeded relationships and facts render a realistic map (price list → menu page / PDF / ordering page → campaign; two inconsistent shared facts) |

New database objects (`…000500_dependency_graph.sql`): `current_facts` view, direction-independent unique index for relationships, immutable endpoints trigger.

### Verification (run 2026-11-12, in this environment, from a clean build)

| Check | Result |
|---|---|
| `npm run typecheck` / `npm run lint` | ✅ 0 errors / 0 problems |
| `npm test` (unit) | ✅ 25 files, 207 tests (+15 graph domain: keys, suggestions, traversal, layout, inconsistency, performance with 1,000 assets; +4 graph service) |
| `npm run test:db` (PostgreSQL 16) | ✅ 5 files, 55 tests (+5: reverse duplicates, self/cross-tenant links, viewer writes, immutable endpoints, `current_facts` tenancy/archived) |
| `npm run build` | ✅ success |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| E2E demo flows | ✅ 38/38, twice in a row (+13 graph checks: nodes and edges from data, depth highlight, inconsistent information, search, type filter, suggestions stored, manual relationship, reverse duplicate refused, confirm suggestion from the graph, remove relationship, list view) |
| Responsive sweep (22 routes × 3 sizes) | ✅ 66 combinations, no errors, no overflow |

Bugs found and fixed during this stage:
1. A relationship backed only by a shared phone number was typed `derived_from` → now `references` (needs ≥2 shared facts for `derived_from`).
2. Suggestion evidence text depended on fact order (non-deterministic) → keys and labels sorted.
3. The graph opened too small (`fitView` ran before nodes existed) → initial nodes passed on mount, readable minimum zoom.
4. "Disconnected assets" metric (confirmed links only) disagreed with the graph (which shows suggested links) → metric now explains both numbers.
5. Incoming relationships read "links to by" → proper wording ("linked from", "source for", …).
6. E2E race on sidebar counters after approvals → tests poll until the revalidated page commits.

### Known limitations / honest notes

1. Suggestions are rule-based (shared facts and identifiers). They do not understand synonyms beyond a small attribute list (price/cost, phone/telephone, hours…) or entity spelling variants beyond case and punctuation. AI-assisted matching is a Stage 5 candidate.
2. Large workspaces: the map draws at most 80 shared-information nodes and loads up to 20,000 current facts; the layout is computed per request (≈ tens of ms for 1,000 assets in tests).
3. Node positions after dragging are not saved.
4. The canvas is a visual tool; screen-reader users should use the List view (linked from the same page).
5. Supabase/PostgREST paths (paging `current_facts`, suggestion inserts) are tested at the SQL level only, as in previous stages.

### Files added / modified in Stage 4

- Migration: `supabase/migrations/20261112000500_dependency_graph.sql`
- Domain: `src/domain/graph/{keys,suggest,traverse,build}.ts` (+ `graph.test.ts`), `inputs.ts`
- Server: `src/server/graph.ts`, `src/server/workspaces/graph-actions.ts`, data layer (`source`, `demo`, `supabase`), `asset-actions.ts` (post-scan suggestions)
- UI: `src/components/graph/{nodes,dependency-graph,graph-forms}.tsx`, `components/app/meta.tsx`, Change Map page (graph + list views), dashboard link
- Tests: `tests/db/graph.test.ts`, `tests/unit/graph-service.test.ts`, e2e scripts
- Docs: `ARCHITECTURE.md` §13, `README.md`


## Stage 3 — Asset Intelligence ✅

### Delivered

| Requirement | Implementation |
|---|---|
| 6 asset types | website, PDF, CSV, manual record, product catalog, marketing content (unchanged enum; parser chosen by file content) |
| Add / edit / delete | Register (Stage 2) + edit metadata dialog + delete with typed-name confirmation (cascades versions, facts, scans, relationships, proposals; stored files removed) |
| Upload documents | Server Action upload (10 MB), drag & drop, magic-byte detection, private Supabase Storage bucket (`…000400_storage.sql`) |
| Register & scan websites | SSRF-safe single-page fetcher; scan button on assets with a URL |
| PDF | Text per page (unpdf), prices/phones/emails/hours, image-only pages reported, password/damaged PDFs fail clearly |
| CSV | Delimiter + header detection, column types (text, number, currency, percent, date, boolean, email, url, phone), entity column + entity kind, every cell → fact, malformed rows skipped and reported |
| Websites | Title, meta description, language, headings, visible text, schema.org JSON-LD (products, menu items, offers, businesses, hours, addresses), microdata, tel:/mailto: links, text patterns |
| Normalized facts | `extracted_facts`: entity, attribute, value, normalized value, number + unit, source asset, source location, extraction time, confidence, method, version |
| Versions & timestamps | New version only when the content hash changes; `last_scanned_at`; full scan history with duration, bytes, HTTP status |
| Status & errors | `asset_scans` history; succeeded / partial / failed with reasons and warnings; stale scans closed; UI alerts, scan history, warnings |
| Manual business records | Add / remove manual facts (100% confidence, unversioned, audited) |
| Asset Management UI | Asset detail tabs: Overview (source panel, impacts, connections, proposals, details, content summary) · Extracted information (searchable fact table with normalized values, locations, confidence) · Scans & versions. Facts column in the asset list |
| Demo | Seeded facts consistent with the demo story (price list says $15, menu/PDF/ordering page still $12; Harborside phone differs), scan history, version summaries; uploads work in memory; website scans are disabled in demo |

New database objects (`…000300_asset_intelligence.sql`): `asset_scans`, `extracted_facts`, `extraction_method` enum, `asset_fact_counts` view (security invoker), `start_asset_scan()`, `record_scan_result()`, RLS for all, authorship stamping, audit of manual facts.

### Verification (run 2026-11-12, in this environment, from a clean build)

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` | ✅ 0 problems |
| `npm test` (unit) | ✅ 23 files, 188 tests (extraction 37, SSRF/fetch with a real local HTTP server, files & PDF, runner integration, demo data) |
| `npm run test:db` (PostgreSQL 16) | ✅ 4 files, 50 tests (+14 asset-intelligence: lifecycle, versioning, duplicates, caps, RLS, cross-tenant, cascade; + row mapping for facts/scans) |
| `npm run build` | ✅ success |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| E2E demo flows | ✅ 25/25 (CSV upload partial, facts table, scan warnings, unsupported file → failed, PDF through the production bundle, manual fact add/remove, demo scan restriction, edit, delete with confirmation) |
| Responsive sweep (21 routes × 3 sizes) | ✅ 63 combinations, no errors, no overflow |

Issues found and fixed during this stage:
1. A test caught that the redirect-to-metadata case was blocked by the port rule before the IP rule — both block, test now checks the IP rule separately.
2. Demo assets showed “No content has been read yet” although they had versions → demo version records with content summaries added.
3. E2E race: toasts appear before the revalidated page is committed → tests now wait for rendered elements.
4. “0 ms” scan durations for seeded scans → hidden.

### Known limitations / honest notes

1. **Website scanning was not tested against the real internet** (this sandbox only allows outbound traffic through a proxy, which the scanner intentionally does not use). It is tested end-to-end against a real local HTTP server with an injected resolver; the SSRF policy is tested with the strict defaults.
2. **Supabase Storage upload/delete and the PostgREST layer are not exercised** (no Supabase project here). SQL, RPCs and RLS are tested on PostgreSQL; the storage migration is skipped there.
3. No OCR: image-only PDF pages are reported as unread (scan becomes `partial`, or `failed` if no page has text).
4. No JavaScript rendering: single-page apps produce a `partial` scan with a clear warning.
5. Single page per scan; no crawling, no scheduled rescans, no robots.txt check yet (only explicit, user-triggered single-page reads).
6. Office formats (.docx/.xlsx) are rejected with a message; export to PDF/CSV.
7. The rate limit (10 scans/user/minute) is per server instance; a shared store is needed for multi-instance deployments.
8. Scans run synchronously inside the Server Action (`maxDuration = 60`); a background queue is a later optimization.
9. Text patterns are heuristic (confidence 0.6–0.7) and English-centric for day names; structured sources (JSON-LD, CSV) are preferred and get higher confidence.

### Files added / modified in Stage 3

- Migrations: `20261112000300_asset_intelligence.sql`, `20261112000400_storage.sql`
- Domain: `src/domain/extraction/{sanitize,normalize,fact,text-patterns,json-ld,html,csv}.ts` (+ tests); `model.ts`, `inputs.ts`, `insights/activity.ts`
- Server: `src/server/intelligence/{errors,url-guard,safe-fetch,files,pdf,analyze,runner}.ts`, `src/server/rate-limit.ts`, `src/server/workspaces/asset-actions.ts`, `src/server/demo/seed-intelligence.ts`; data layer (`source`, `demo`, `demo-store`, `supabase`, `rows`)
- UI: `src/components/forms/asset-forms.tsx`, `src/components/features/{scan-history,content-summary}.tsx`, `src/components/app/fact-meta.ts`; asset detail and asset list pages
- Tests: `tests/db/asset-intelligence.test.ts`, `tests/unit/{url-guard,safe-fetch,files-pdf,runner}.test.ts`, `tests/helpers/pdf.ts`, updated row-mapping, demo-data and e2e scripts
- Config/docs: `next.config.ts` (upload body limit), `ARCHITECTURE.md` §12, `INSTALLATION.md`, `README.md`


## Stage 2 — Premium UI ✅

### Delivered

| Requirement | Implementation |
|---|---|
| Design system | Graphite + indigo tokens for light/dark, status & impact-level colours, Geist Sans/Mono, 13 UI primitives (button, input, label, textarea, native select, card, alert, badge, dialog, sheet, dropdown, tabs, tooltip, table, skeleton, toaster) |
| Data visualization | Accessible SVG/CSS charts: stacked bar, donut, bar list, weekly trend (all values also given as text) |
| Application shell | Desktop sidebar with live counters, workspace switcher, role/plan card; sticky top bar with user menu (theme, settings, sign-out); mobile/tablet navigation sheet; demo banner |
| Sidebar | Overview · Assets · Change Map · Changes · Approvals · Integrations · Activity · Settings |
| 16 pages | Login, Registration (split-screen brand panel) · Onboarding · Dashboard · Assets · Asset details · Change Map · Changes · Impact analysis (change details) · Approval Center · Update proposals · Activity · Integrations · Team · Settings · Billing |
| Dashboard | Connected assets, detected changes, pending approvals, potential conflicts, change impact overview, asset health (donut + needs attention), recent activity, weekly trend, relationship review |
| Empty / loading / error | Empty states on every list, `loading.tsx` skeletons on every workspace route, workspace 404, honest "not analyzed / not scanned / planned" states |
| Demo data | Fictional "Harbor & Vine" restaurant group: 15 assets, 14 relationships (4 suggested, 1 rejected), 6 changes of all 5 types, 14 impacts with relationship paths, 12 proposals, approvals with comments, 22 audit events. Every record is tagged *Sample*; integrations are intentionally not connected |
| Real data | Same pages read real tenant data through `SupabaseWorkspaceData` (RLS); no page uses hardcoded UI data |

### Working interactions (every button does something real)

| Interaction | Demo | Real accounts |
|---|---|---|
| Register asset (metadata) | ✅ | ✅ insert, RLS editor+ |
| Record change (draft) | ✅ | ✅ insert, RLS editor+ |
| Approve / request revision / reject proposal (comment required for the last two) | ✅ | ✅ `decide_update_proposal()` RPC, admin+ |
| Confirm / reject suggested relationship | ✅ | ✅ update, editor+, reviewer stamped |
| Change member role / remove member (confirmation dialog) | ✅ | ✅ admin+, owner rules |
| Rename workspace | ✅ | ✅ admin+ |
| Update profile name & language | n/a (no profile in demo) | ✅ |
| Theme (light/dark/system), language (en/az/tr), filters, search, navigation, external source link | ✅ | ✅ |

Capabilities that belong to later stages are shown as **Planned · Stage N** labels, never as buttons: file upload & scanning (3), interactive graph (4), automatic impact analysis (5), execution & exportable instructions (6), checkout, invitations & connectors (7).

### Verification (run 2026-11-12, in this environment)

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` | ✅ 0 problems |
| `npm test` (unit) | ✅ 15 files, 68 tests |
| `npm run test:db` (PostgreSQL 16: migrations, RLS, workflow RPC, row mapping) | ✅ 3 files, 35 tests |
| `npm run build` | ✅ success |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| E2E demo flows (`tests/e2e/demo-flows.cjs`, Playwright) | ✅ 14/14 checks |
| Responsive sweep 390 / 820 (dark) / 1440 px, 18 routes | ✅ 54 combinations: no HTTP errors, no console errors, no horizontal overflow |

Bugs found and fixed during verification:
1. Donut segments did not render (dynamic Tailwind class names) → explicit CSS colours.
2. Weekly trend bars had zero height → flex layout fix.
3. Horizontal overflow on 7 pages at 390 px (grid items with `min-width: auto`) → global grid reset.
4. Toasts did not appear when the submitting card disappeared after revalidation → feedback moved from effects to the action result.
5. Forms lost typed values after a server-side validation error (React form reset) → submitted values returned as defaults.
6. Graph statistics counted relationships to archived assets → only active assets counted (caught by a unit test).

### Known limitations / honest notes

1. **Supabase mode is still not exercised end-to-end** (no Supabase project or Docker here). The SQL, RPCs, RLS and row mapping are tested against real PostgreSQL; the PostgREST/Auth layer itself is not.
2. **Demo state lives in server memory**: lost on restart and not shared between server instances (on serverless hosting a visitor could land on a different instance and see a fresh demo).
3. **Page copy is English only.** Navigation, auth, onboarding and shell strings are translated (en/az/tr); workspace page bodies are not yet.
4. The snapshot loads a whole workspace per request (fine for the plan limits of ≤1,000 assets; audit log capped at 300 rows). Pagination is a later optimization.
5. The E2E scripts need Playwright + Chromium and are not yet part of CI.
6. Creating a second workspace inside an existing organization has no UI yet (the switcher offers "New organization").
7. From Stage 1, still open: no CSP header, no app-level rate limiting, DB types not generated.

### Files added / modified in Stage 2

- New migration: `supabase/migrations/20261112000200_workflow_rpc.sql`
- Domain: `src/domain/workspace/{model,inputs}.ts`, `src/domain/insights/{metrics,activity,graph-stats}.ts`, `src/domain/billing/plans.ts`, `src/domain/integrations/catalog.ts` (+ tests)
- Server: `src/server/data/{source,index,demo,demo-store,supabase,rows}.ts`, `src/server/demo/seed.ts`, `src/server/workspaces/mutations.ts`; modified `session.ts`, `service.ts`, `fixture.ts`, `app/demo/route.ts`, `proxy.ts`
- UI: `src/components/ui/*` (9 new primitives), `src/components/{app,charts,features,forms,shell}/*`, `src/components/layout/brand-panel.tsx`
- Pages: everything under `src/app/w/[workspaceId]/**`, `(auth)/layout.tsx`, `onboarding/page.tsx`, `layout.tsx`, `globals.css`
- Tests: `tests/db/{workflow,row-mapping}.test.ts`, `tests/unit/demo-data.test.ts`, `tests/e2e/{demo-flows,responsive-sweep}.cjs`
- Config/docs: `package.json` (geist, sonner, `test:e2e`), `eslint.config.mjs`, `vitest.db.config.mts`, `ARCHITECTURE.md`, `INSTALLATION.md`, `README.md`, i18n messages


## Stage 1 — Foundation ✅

### Delivered

| Requirement | Implementation |
|---|---|
| Inspect repository | Existing `adscript-studio/` app and skills left untouched; CHANGEMESH isolated in `changemesh/` |
| Next.js + TypeScript | Next.js 16 App Router, TS strict + `noUncheckedIndexedAccess` |
| Tailwind + shadcn/ui | Tailwind 4, light/dark tokens, `components.json`, button/input/label/card/alert/badge |
| Supabase + PostgreSQL | `@supabase/ssr` user client (RLS) + server-only service client; `supabase/config.toml` |
| Modular architecture | `app/` (routes) · `domain/` (pure logic) · `server/` (I/O) · `lib/` · `components/` · `i18n/` |
| Environment | Zod-validated public/server env, `.env.example`, `ENVIRONMENT.md` |
| Authentication | Email/password sign-up & sign-in, optional Google OAuth, email-link callback, POST sign-out, session refresh + route protection in `proxy.ts`, open-redirect guard |
| Schema & migrations | `supabase/migrations/20261112000100_foundation.sql` — 15 tables, 17 enums, indexes, triggers |
| Organizations & workspaces | Atomic onboarding RPC, onboarding page, workspace overview with real member list |
| Roles | Owner / Admin / Editor / Viewer (workspace), Owner / Admin / Member (organization) |
| Multi-tenant authorization | RLS on all tables, SECURITY DEFINER helpers, composite tenant FKs, no client-side membership inserts, last-owner protection, 404 for foreign workspaces |
| Error handling & logging | `AppError` + safe public errors, Postgres code mapping, `runAction()`, JSON logger with redaction + request ids, error/404 pages |
| ESLint + strict TS | Flat config (`next/core-web-vitals` + `typescript`), `no-explicit-any`, `no-console` |
| Automated tests | Vitest unit suite + PostgreSQL RLS suite + CI workflow |
| Demo mode | `CHANGEMESH_DEMO_MODE=enabled`: fictional workspace, persistent banner, isolated from Supabase |
| i18n architecture | `en` (default), `az`, `tr` with compile-time key parity and a test |

### Entities → tables

User → `profiles` · Organization → `organizations` (+ `organization_members`) · Workspace → `workspaces` · WorkspaceMember → `workspace_members` · Asset → `assets` · AssetVersion → `asset_versions` · AssetRelationship → `asset_relationships` · Change → `changes` · ChangeImpact → `change_impacts` · UpdateProposal → `update_proposals` · Approval → `approvals` · Integration → `integrations` · AuditLog → `audit_logs` · Subscription → `subscriptions`

### Verification (run 2026-11-12, in this environment)

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | ✅ 0 errors |
| ESLint | `npm run lint` | ✅ 0 problems |
| Unit tests | `npm test` | ✅ 8 files, 34 tests passed |
| DB / RLS tests | `npm run test:db` (PostgreSQL 16) | ✅ 1 file, 25 tests passed |
| Production build | `npm run build` | ✅ success, 13 routes |
| Dependency audit | `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| Runtime smoke test | `next start` + curl | ✅ `/`, `/login`, `/api/health`, demo enter/exit, protected-route redirects, 404 for foreign workspace ids, security headers, `x-request-id` |
| Responsive check | Playwright 390 px (dark) and 1366 px (light) | ✅ no horizontal overflow on `/`, `/login`, `/w/demo` |

### Known limitations / honest notes

1. **Supabase sign-up/sign-in was not exercised end-to-end here.** This environment has no Supabase project and no Docker, so the real auth round-trip (email confirmation, OAuth) is untested. The database layer is tested against plain PostgreSQL with a minimal `auth` shim (`tests/db/supabase-shim.sql`) that mirrors Supabase's `auth.uid()` contract.
2. **shadcn/ui registry was unreachable** (network policy, HTTP 403), so components were written by hand following the shadcn new-york conventions. `npx shadcn add …` will work in a normal environment.
3. **TypeScript DB types are not generated.** Rows are validated with Zod at the repository boundary instead. Generate with `npx supabase gen types typescript --linked` once a project is linked.
4. Deleting a user who is the **sole owner** of a workspace is blocked by the last-owner rule; ownership transfer UI comes with team management (Stage 7).
5. Audit logs are deleted together with their organization/workspace (cascade). A retention/export policy is a Stage 8 decision.
6. No Content-Security-Policy header yet (planned for the hardening stage); other security headers are set.
7. No rate limiting in the app layer yet; Supabase Auth applies its own limits to auth endpoints.
8. Stage 1 UI is functional but intentionally plain; the premium design system is Stage 2.

### Files added / modified in Stage 1

- `.github/workflows/changemesh.yml` (new)
- `changemesh/` — all files (new): configs (`package.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs`, `components.json`, `vitest*.mts`, `.env.example`, `.gitignore`), `src/**`, `supabase/**`, `tests/**`, `scripts/test-db.sh`, docs (`README.md`, `ARCHITECTURE.md`, `INSTALLATION.md`, `ENVIRONMENT.md`, `DEVELOPMENT_STATUS.md`)
- `changemesh/docs/ARCHITECTURE.md` → moved to `changemesh/ARCHITECTURE.md` and rewritten


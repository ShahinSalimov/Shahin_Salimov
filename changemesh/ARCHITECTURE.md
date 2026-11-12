# CHANGEMESH — Architecture

> *Every change. Every connection. One control center.*
> This document describes what is **implemented** (marked ✅) and what is **designed but not built yet** (marked ⏳ with the stage that delivers it). Progress is tracked in [DEVELOPMENT_STATUS.md](./DEVELOPMENT_STATUS.md).

## 1. Repository layout

The repository is a personal monorepo. CHANGEMESH is fully self-contained in `changemesh/`; nothing outside it was modified except a new CI workflow.

| Path | Owner | Notes |
|---|---|---|
| `changemesh/` | CHANGEMESH | This application |
| `.github/workflows/changemesh.yml` | CHANGEMESH | CI: typecheck, lint, unit tests, DB/RLS tests, build |
| `adscript-studio/`, `.github/workflows/adscript-studio.yml` | other project | Untouched |
| `.claude/skills/`, `README.md` | other | Untouched |

## 2. Stack

| Layer | Choice | Status |
|---|---|---|
| Framework | Next.js 16 App Router (Server Components, Server Actions, Route Handlers, `proxy.ts`) | ✅ |
| Language | TypeScript `strict` + `noUncheckedIndexedAccess`, `noImplicitOverride` | ✅ |
| Styling | Tailwind CSS 4, design tokens in `src/app/globals.css` (light + dark) | ✅ |
| Components | shadcn/ui conventions (`components.json`, `cva`, Radix primitives via `radix-ui`, `lucide-react`), Sonner toasts, Geist fonts | ✅ |
| Auth | Supabase Auth (email + password, optional Google OAuth) via `@supabase/ssr` cookies | ✅ |
| Database | Supabase Postgres, Row Level Security on every table | ✅ |
| Migrations | SQL files in `supabase/migrations/`, applied with the Supabase CLI | ✅ |
| Validation | Zod at every input boundary (forms, env, DB rows) | ✅ |
| i18n | Typed dictionaries `en` (default), `az`, `tr`; cookie or `Accept-Language` | ✅ skeleton |
| Logging | Structured JSON logger with secret redaction and request ids | ✅ |
| Tests | Vitest (unit) + Vitest against real PostgreSQL (migrations + RLS) | ✅ |
| Data visualization | Hand-built accessible SVG/CSS charts (stacked bar, donut, bar list, trend) | ✅ Stage 2 |
| Graph UI | React Flow (`@xyflow/react`) with custom nodes, deterministic layered layout | ✅ Stage 4 |
| Parsing | `unpdf` (PDF), `papaparse` (CSV), `node-html-parser` (HTML) | ✅ Stage 3 |
| AI | `ChangeAnalyzer` abstraction: rule-based (default, demo) or Claude via `@anthropic-ai/sdk` structured outputs | ✅ Stage 5 |
| Billing | Stripe (test mode), webhook signature verification | ⏳ Stage 7 |

## 3. Source layout

```
changemesh/
  src/
    app/                      routes only — thin, no business logic
      (auth)/login, (auth)/signup     auth pages (route group)
      auth/callback, auth/signout     OAuth / email-link handler, POST sign-out
      demo, demo/exit                 start / end a demo session (POST)
      app/                            post-login router → workspace or onboarding
      onboarding/                     create organization + first workspace
      w/[workspaceId]/                workspace area (layout loads + authorizes)
      api/health                      liveness + config flags (no secrets)
      error.tsx, global-error.tsx, not-found.tsx
    domain/                   pure TypeScript, no I/O, fully unit-tested
      rbac/roles.ts           roles, permission matrix, role-assignment rules
      auth/schemas.ts         sign-in/up schemas, open-redirect guard
      workspace/              slug + input schemas
    server/                   server-only I/O ("server-only" import guard)
      env.server.ts           server env (service-role key lives only here)
      supabase/clients.ts     createUserClient (RLS) / createServiceClient (bypass, restricted)
      auth/session.ts         getViewer(): real user | demo visitor | null
      auth/actions.ts         sign in / sign up / Google (Server Actions)
      workspaces/             service (queries), actions (onboarding), load (page helper)
      demo/fixture.ts         fictional demo organization
      action.ts               runAction(): logging + safe error mapping for Server Actions
    lib/                      shared, isomorphic: env (public), errors, logger, utils
    components/ui/            shadcn-style primitives (button, input, label, card, alert, badge)
    components/               app components (theme, locale switcher, form field, logo)
    i18n/                     locale config, messages (en/az/tr), server helpers
    proxy.ts                  request id, session refresh, protected-route redirect
  supabase/migrations/        versioned SQL
  tests/db/                   PostgreSQL harness + RLS / isolation tests
  scripts/test-db.sh          throwaway local PostgreSQL for DB tests
```

**Dependency rule:** `domain/` imports nothing from `server/` or `app/`. `server/` may import `domain/` and `lib/`. Client Components may import `domain/`, `lib/`, `components/` and Server Actions — never `server/*` modules directly (enforced by `server-only`).

## 4. Tenancy model

```
User (profiles) ──< OrganizationMember >── Organization ──< Workspace ──< WorkspaceMember >── User
                                              │                │
                                         Subscription          ├── Asset ──< AssetVersion
                                              │                ├── AssetRelationship (asset → asset)
                                          AuditLog ────────────├── Change ──< ChangeImpact
                                                               ├── UpdateProposal ──< Approval
                                                               └── Integration
```

- **Organization** = the customer account (billing, people). **Workspace** = an isolated data space (a brand, a client of an agency, a region).
- **Roles**
  - Workspace: `owner > admin > editor > viewer`.
  - Organization: `owner > admin > member` (billing and workspace creation).

### Permission matrix (workspace)

| Capability | Owner | Admin | Editor | Viewer |
|---|:-:|:-:|:-:|:-:|
| View workspace data | ✓ | ✓ | ✓ | ✓ |
| Create / edit / delete assets, relationships, changes, proposals | ✓ | ✓ | ✓ | – |
| Approve / reject / execute update proposals | ✓ | ✓ | – | – |
| Manage members and roles | ✓ | ✓ (not owners) | – | – |
| Manage integrations | ✓ | ✓ | – | – |
| View audit log | ✓ | ✓ | – | – |
| Delete workspace, grant ownership | ✓ | – | – | – |

The same matrix exists twice on purpose: `src/domain/rbac/roles.ts` (UI + early, friendly errors) and SQL policies (the actual enforcement). Tests cover both.

## 5. Database (migration `20261112000100_foundation.sql`) ✅

| Table | Key points |
|---|---|
| `profiles` | 1:1 with `auth.users`, created by trigger. Users can edit name/locale only (trigger blocks `is_platform_admin`, `email`). |
| `organizations`, `organization_members` | Created only via `create_organization_with_workspace()` RPC. |
| `workspaces`, `workspace_members` | Creator automatically becomes owner. A workspace can never lose its last owner. Only owners grant/remove ownership. |
| `assets` | 6 types: `website`, `pdf`, `csv`, `manual`, `product_catalog`, `marketing_content`; scan status + error fields; `website` requires a URL. |
| `asset_versions` | Version history per asset, unique `(asset_id, version)`. |
| `asset_relationships` | `derived_from`, `embeds`, `links_to`, `syncs_with`, `references`, `duplicates`; status `suggested/confirmed/rejected`; confidence 0–1; no self-links. |
| `changes` | Change types `created/updated/deleted/conflicting/outdated`; lifecycle status. |
| `change_impacts` | Affected asset, impact level `critical/high/medium/low`, depth, relationship path (JSON), confidence, recommended action. |
| `update_proposals` | Current vs proposed value, evidence, approval status (`pending/approved/rejected/needs_revision`), execution status (`not_started/ready/in_progress/completed/failed`), **unique immutable idempotency key**. A CHECK constraint makes execution impossible before approval. |
| `approvals` | Immutable decision records; `decided_by` must equal the caller. |
| `integrations` | Provider config; `secret_ref` only (reference to a vault), never secrets. |
| `subscriptions` | One per organization; only the service role (billing webhook) writes. |
| `audit_logs` | Append-only, written by triggers on every important table; records actor, action, target and **which columns changed** (not values). |

**Isolation techniques**

1. RLS enabled on all 15 tables; `anon` has no privileges at all.
2. Authorization helpers (`has_workspace_role`, `has_organization_role`, …) are `SECURITY DEFINER` with an empty `search_path`, so policies cannot be hijacked and do not recurse.
3. Composite foreign keys `(child_id, workspace_id) → parent(id, workspace_id)` make cross-tenant references impossible even with a guessed UUID.
4. Membership rows cannot be inserted by clients at all — only by RPCs (onboarding now, invitations in Stage 7).
5. Unknown and foreign workspaces both return 404 in the app (existence is not revealed).

## 6. Authentication ✅

- Supabase Auth with HTTP-only cookies via `@supabase/ssr`. `proxy.ts` refreshes the session on every request; pages re-validate with `auth.getUser()` (server-verified, not just the cookie).
- Sign-in errors never reveal whether an email exists. Sign-up requires email confirmation (configurable in Supabase).
- Redirect targets after login pass `safeNextPath()` (blocks `//evil.com`, absolute URLs, header injection).
- Sign-out is POST-only.
- **No placeholder auth.** If Supabase is not configured, the login page says so explicitly; it never pretends to sign anyone in.

## 7. Demo mode ✅ (foundation)

- Enabled only with `CHANGEMESH_DEMO_MODE=enabled`.
- A demo session is a cookie that grants access to **one fictional workspace held in server code** (`src/server/demo/fixture.ts`). It cannot reach Supabase or any real tenant, and it is not an account.
- Every demo page shows a persistent banner: *"Demo mode — fictional sample data. Nothing you do here is saved or sent anywhere."*
- Demo identities use reserved domains (`.example`, `.invalid`).

## 8. Error handling and logging ✅

- `AppError` (code + safe message + HTTP status). `toPublicError()` converts anything thrown into a user-safe message; unexpected errors become a generic message and are logged in full on the server.
- Postgres error codes are mapped (`23505` → conflict, `42501` → forbidden, …).
- `runAction()` wraps every Server Action: request id, structured log, safe result.
- Logger: one JSON line per event, recursive redaction of keys such as `password`, `token`, `apiKey`, `authorization`, `cookie`, `serviceRole`.
- `error.tsx`, `global-error.tsx` and `not-found.tsx` show honest messages with a reference id.

## 9. Security baseline ✅

- Service-role key: server-only module + `server-only` guard; never prefixed with `NEXT_PUBLIC_`.
- Security headers: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; `X-Powered-By` removed. A full CSP is planned for the hardening stage.
- Zod validation for all inputs and DB rows read by the app.

## 10. Data access layer (Stage 2) ✅

```
page.tsx ──► loadWorkspace(id)       → WorkspaceContext (viewer, workspace, role)  [404 if not a member]
        └──► loadSnapshot(ctx)        → WorkspaceSnapshot (one per request, React cache)
                 │
                 ├─ SupabaseWorkspaceData  — real tenants; every query as the user (RLS)
                 └─ DemoWorkspaceData      — fictional, per demo session, in server memory
        └──► domain/insights/*        → pure functions: metrics, asset health, impact overview,
                                         graph stats (depth, clusters, disconnected), activity text
```

- **One interface (`WorkspaceData`)** for reads (`snapshot()`) and the Stage-2 mutations: register asset, record change (draft), decide proposal, review relationship, change member role, remove member, rename workspace. Profile updates go directly to `profiles` (RLS: self only).
- **Mutations** are Server Actions in `src/server/workspaces/mutations.ts`: authenticate → load workspace context → check permission with `domain/rbac` → validate input with Zod (`domain/workspace/inputs.ts`) → call `WorkspaceData` → `revalidatePath`. The database checks the same rules again.
- **Approvals** go through the `decide_update_proposal()` RPC (migration `…000200`): atomic status change + approval record, comment required for reject / revision, no second decision on approved/rejected proposals.
- **Authorship** (`created_by`, `reviewed_by`) is stamped by database triggers from the JWT and cannot be spoofed.
- **Row mapping**: PostgREST rows are validated with the Zod schemas in `src/server/data/rows.ts`; `tests/db/row-mapping.test.ts` checks them against real PostgreSQL output. Malformed rows are logged and skipped instead of crashing a page.
- **Demo store**: `Map<sessionId, state>` with 8-hour TTL and a 500-session cap. A new visitor gets a fresh copy of the seed (`src/server/demo/seed.ts`). State is lost on restart and is not shared between server instances.

## 11. UI architecture (Stage 2) ✅

- **Shell**: fixed sidebar (≥1024 px) with live counters (open changes, pending approvals), workspace switcher, role/plan card; sticky top bar with breadcrumb and user menu (theme, settings, sign-out); slide-in navigation sheet on mobile/tablet; persistent demo banner.
- **Routes** (`/w/[workspaceId]/…`): overview, assets, assets/[id], graph (Change Map), changes, changes/[id] (impact analysis), approvals (Approval Center), proposals, integrations, activity, settings, settings/team, settings/billing. Public: `/`, `/login`, `/signup`, `/onboarding`.
- **Filters and search** use URL query parameters and server rendering, so they work without JavaScript and links are shareable.
- **Status language**: every status is shown as icon + label + colour (`components/app/meta.tsx`, `status-pill.tsx`). Demo records carry a *Sample* tag; unbuilt capabilities show *Planned · Stage N* instead of a button.
- **Feedback**: `useMutation()` shows toasts as soon as the server answers and keeps typed values when validation fails (React resets forms after actions).
- **Loading**: route-level skeletons (`loading.tsx`) for every workspace page; workspace-scoped `not-found.tsx`.
- **Responsiveness**: checked automatically at 390 / 820 / 1440 px (`tests/e2e/responsive-sweep.cjs`).

## 12. Asset Intelligence (Stage 3) ✅

```
upload (PDF/CSV/TXT) ─┐                      ┌─ domain/extraction (pure, tested)
                      ├─► server/intelligence │   html.ts      title, meta, headings, visible text, microdata, tel:/mailto:
website URL ──────────┘    runner.ts          │   json-ld.ts   schema.org Product/MenuItem/Offer/LocalBusiness
                            │ files.ts         │   csv.ts       delimiter, header, column types, entity column, cells → facts
                            │ pdf.ts (unpdf)   │   text-patterns prices, phones, emails, opening hours (PDF/text/HTML)
                            │ safe-fetch.ts    │   normalize.ts money/phone/hours/text normalization
                            ▼                  └─  sanitize.ts  control/zero-width/bidi removal, length caps
                    analyze.ts → ScanResult {status, contentHash, summary, facts[], warnings[], error, stats}
                            ▼
      start_asset_scan() ──► record_scan_result()   (one transaction: version + facts + asset status + scan row)
```

**Normalized fact model** (`extracted_facts`): entity name, attribute name, value text, numeric value + unit, normalized value (e.g. `USD 15.00`, `+15550142`, `mon-sun 11:00-23:00`), source asset, asset version (NULL for manual facts), source location (row/column, page/line, element path, JSON-LD path, link), extraction method, confidence, extraction timestamp, scan id.

**Versioning**: every successful or partial scan whose content hash differs from the latest version creates `asset_versions` vN+1 with a content summary; the facts of older versions stay as history. Identical content creates no new version. Failed scans never change the current version.

**Honest status** (`asset_scans` + asset `scan_status`):

| Situation | Status |
|---|---|
| Content fully read | `succeeded` (even with 0 facts — a warning says nothing was recognized) |
| Truncated (size/row/page/fact caps), malformed CSV rows, image-only PDF pages, non-UTF-8 text, page with no visible text | `partial` + warnings |
| HTTP error, timeout, blocked address, non-HTML response, unsupported/disguised file, no readable rows/text | `failed` + reason; previous version and facts kept |
| A scan "running" for more than 5 minutes | closed as `failed` (“did not finish”) when the next scan starts |

**Limits**: uploads 10 MB (CSV 5 MB, text 2 MB), PDFs 100 pages / 20 s, web pages 2 MB (decompressed) / 10 s / 3 redirects, CSV 5,000 rows × 50 columns, 5,000 facts per scan, one running scan per asset, 10 scans per user per minute (per server instance).

**Untrusted content**:
- SSRF: only http(s) on ports 80/443; no credentials in URLs; internal host names rejected; IP literals (incl. decimal/hex/octal and IPv4-mapped IPv6) checked; **every resolved address is checked at connection time** through a custom DNS `lookup`, which also covers redirects and DNS rebinding; private, loopback, link-local (cloud metadata), CGNAT, multicast, documentation and reserved ranges are blocked; proxies are not used.
- Files are identified by magic bytes, not names; Office/ZIP and binary files are rejected with a clear message; file names are sanitized; originals are stored privately (`asset-files` bucket, path `workspace/asset/sha256.ext`).
- HTML is parsed, never rendered or executed: scripts, styles, iframes and hidden elements are removed; links are not followed.
- Extracted text is stripped of control, zero-width and bidirectional-override characters and length-capped; it is displayed as plain text only.
- Extraction is rule-based. **Text inside documents is treated as data, never as instructions** — a document saying "ignore previous instructions" just becomes a text value (covered by a test). When AI is added (Stage 5) content will be passed as delimited data and its output schema-validated.
- CSV cells starting with `= + - @` are flagged and stored as plain text (no formula evaluation).
- Demo mode never fetches external websites (anonymous visitors cannot use the server as a fetch proxy); demo uploads are analyzed in memory and not stored.

## 13. Dependency Intelligence Graph (Stage 4) ✅

```
DB records ──► buildDependencyGraph()  (src/domain/graph/build.ts, pure)
  assets                 asset nodes (active only) with type, health, fact count, dependency layer
  asset_relationships    relationship edges (confirmed / suggested / rejected) with type + confidence
  current_facts (view)   entity nodes ──has──► information nodes (entity · attribute, shared by ≥2 assets)
                         information ──appears in──► asset edges, value per asset, mismatches flagged
```

- **Layout** (deterministic, server-side): sources on the left, dependents to the right. Layer = 1 + max layer of everything an asset depends on (edges point from dependent to upstream; cycles are cut). Two barycenter sweeps order nodes to reduce crossings; information and entity columns are ordered next to the assets they appear in; assets with no relationship at all go to a "Not connected" column. At most 80 information nodes are drawn (inconsistent ones first).
- **Suggestions** (`src/domain/graph/suggest.ts`, rule-based, explainable): two assets are linked when they share ≥2 entity/attribute facts or one identifier (phone, email, address). Confidence = 0.35 + 0.45·overlap + 0.15·agreement (+0.1 for a shared identifier), capped at 0.95, minimum 0.5. Direction follows source-of-truth authority (CSV/manual → catalog → PDF/website → marketing): `derived_from` toward CSV/manual sources when ≥2 facts overlap, `duplicates` for equally authoritative assets with identical shared values, otherwise `references`. The note explains the evidence ("3 shared facts (…); 2 with matching values, 1 different"). Pairs that already have any relationship — **including rejected ones** — are never suggested again. Suggestions run on demand ("Suggest relationships") and automatically after a scan/upload creates a new version.
- **Integrity**: one relationship per asset pair and type regardless of direction (unique index on least/greatest ids), endpoints immutable, no self-links, composite FKs keep both ends in the workspace.
- **UI** (`src/components/graph/`): React Flow canvas with zoom/pan, minimap, controls; search (Enter focuses matches); asset-type filter; toggles for information nodes, suggested and rejected relationships; click a node to highlight its neighborhood up to 1/2/3/all hops; details panel for assets (health, layer, connected assets with hop distance, relationships, shared information), information (value per asset, mismatches) and relationships (direction, type, status, confidence, origin, evidence, confirm/reject/remove). A List view is the text alternative.
- **Data**: `current_facts` view (security invoker) loaded in pages of 1,000 rows (PostgREST limit), capped at 20,000 facts per workspace.

## 14. Change Detection & Impact Analysis (Stage 5) ✅

```
register value / new scanned version / cross-asset comparison
        │                     │                         │
  createChange()      diffFacts(v-1, v)       findInconsistencies()        src/domain/changes (pure)
        └──────────────┬──────┴─────────────────────────┘
                       ▼
             analyzeImpact()  ── direct: assets holding the same entity·attribute fact
                       │      ── indirect: BFS over relationships (dependents of the source; symmetric for syncs_with/duplicates; ≤4 hops)
                       ▼
         ChangeAnalyzer (src/server/ai): RuleBasedAnalyzer | ClaudeAnalyzer (wording only, ±1 level)
                       ▼
     buildProposals() → save_change_analysis() RPC (impacts + pending proposals + analysis metadata, atomic)
```

- **Change types**: `created`, `updated`, `deleted` (from version diffs or manual registration), `outdated` (source of truth disagrees with derived assets), `conflicting` (equally authoritative assets disagree).
- **Register a value**: when a change names a source asset, entity and attribute without an old value, the current value is read from that asset's facts.
- **Each impact** stores: affected asset, old (current) value, new value, relationship path, impact level, confidence, recommended action; the analysis metadata adds reasons, AI rationale, "unexpected value" flags and assets that already show the new value.
- **Scoring**: asset type weight + customer-facing (+2) + holds the fact (+2) + critical attribute when held (+1) + shows a different value (+1) − (depth−1). ≥7 critical, ≥5 high, ≥3 medium. Assets only connected (no fact) never exceed medium. Confidence = fact confidence × relationship confidences (suggested ×0.7) × 0.9^(depth−1), ×0.8 for unverified scans.
- **Proposals** are created only for assets that hold the changed value; they are always `pending` / `not_started`. Re-analysis replaces pending proposals and keeps decided ones with their approval history.
- **AI layer**: `CHANGEMESH_AI_PROVIDER=claude` + `ANTHROPIC_API_KEY` enables Claude (`claude-opus-5-5` by default, `CHANGEMESH_AI_MODEL` to override). Requests use `client.beta.messages.parse` with a Zod output schema, `effort: "medium"`, server-side refusal fallbacks (`fallbacks: "default"`), SDK retries for 429/5xx plus one retry for unusable output. Document content is sent inside `<workspace_data>` as untrusted data; the model has no tools and can only return text. Guardrails drop unknown asset ids and level jumps over one step. Every call is recorded in `ai_usage` (tokens, estimated cost from list prices, status, attempts); failures fall back to rules with a visible warning. Demo sessions never call AI.
- **Automation**: a scan/upload that creates version ≥2 records the differences as changes (max 10) and analyzes them with rules; "Detect inconsistencies" records outdated/conflicting facts once per open issue.

## 15. Approval & Update Management (Stage 6) ✅

```
proposal ──(admin)──► approved ─► execution: ready ──(admin claims)──► in_progress ──► completed ──(rollback)──► ready
   │                     │                                    └──► failed ──(retry, same idempotency key)──┘
   └─(admin) needs_revision ──(editor revises, note required)──► pending          rejected (final)
```

- **Statuses**: approval `pending / approved / rejected / needs_revision`; execution `not_started / ready / in_progress / completed / failed`. Approval only sets execution to `ready`; nothing runs automatically.
- **Claiming** (`start_proposal_execution`): admin-only, approved-only, row lock + partial unique index (one running execution per proposal) → duplicate execution is impossible, even from two tabs. An execution stuck for 10 minutes is closed as failed with "outcome unknown". Every claim returns the proposal's **immutable idempotency key** and the attempt number.
- **Finishing** (`finish_proposal_execution`): records result or error (an error message is mandatory for failures), sets the proposal status, and `refresh_change_status()` moves the change to `pending_approval / approved / completed / rejected`.
- **Executors** (`src/server/execution/executors.ts`):
  - `InternalRecordExecutor` — manual records owned by CHANGEMESH: replaces the manual fact, keeps the previous value, **Undo** restores it; idempotent when the value is already applied.
  - `ManualConfirmationExecutor` — websites, PDFs, spreadsheets, catalogs, marketing content: a person applies the update outside CHANGEMESH and confirms with a note; **Reopen** marks it not applied. CHANGEMESH never publishes externally.
  - `IntegrationConnector` interface (empty registry) — contract for future connectors: send the idempotency key, read back the value, return rollback data.
- **Preview** (simulation): dry run showing target, before → after and steps; recorded in history; changes nothing.
- **Exports**: `/w/[id]/updates/export?format=csv|md&scope=open|all` — formula-safe CSV and escaped Markdown instructions.
- **History**: `update_executions` (insert/update via RPCs, audited by trigger) shown on the Update history page.

## 16. Commercial SaaS (Stage 7) ✅

Migration `20261112000800_commercial.sql`.

**Plans and limits.** `src/domain/billing/plans.ts` holds the proposed test prices (Starter $19, Business $59, Agency $149, Enterprise custom — not validated). Limits are enforced **in the database**: `organization_limits(org)` resolves the plan (no live subscription ⇒ Starter) and the `enforce_plan_limits()` trigger refuses the 26th active asset on Starter (also when an archived asset is restored) and extra workspaces. Team size is metered but not limited because the brief defines no member cap. `organization_usage(org)` returns aggregate counts (assets, workspaces, members, scans and AI operations this month, AI cost, connected integrations, active API keys) to anyone who can view the organization.

**Billing (Stripe, test mode only).** `src/server/commercial/stripe.ts` refuses live keys. `startCheckoutAction` (org owner/admin) creates a Stripe Checkout session with `organization_id` metadata and redirects; the success page says the plan changes only after Stripe confirms. `POST /api/webhooks/stripe` verifies the signature on the raw body (`stripe.webhooks.constructEvent`), refuses live-mode events, deduplicates by `stripe_events.id`, re-reads the subscription from Stripe on `checkout.session.completed`, ignores out-of-order events (`last_event_at`), and maps prices to plans with `subscriptionFromStripe()`; unknown prices or orgs return 500 so Stripe retries and nothing is granted. Subscriptions are written only by the service role. The Stripe billing portal handles plan changes, cancellation and invoices.

**Invitations.** Admins create an invitation (`invitations`, one open per email per workspace, roles admin/editor/viewer; only owners invite admins). A 256-bit token is shown once as a link; only its SHA-256 is stored. Email delivery is not configured, so the admin copies the link. `/invite/[token]` previews it through `invitation_preview()` and `accept_invitation()` (SECURITY DEFINER) checks expiry (7 days), revocation, single use and that the signed-in email matches, then adds organization and workspace membership. Signup and login keep `next=/invite/…` so invitees return to the link.

**Notifications.** `notifications` rows are written only by SECURITY DEFINER triggers: change → pending approval (admins), proposal → needs revision (editors), update failed (admins), scan failed (editors), invitation accepted (inviter), subscription past_due/unpaid (org owners/admins). The actor is not notified about their own action. Users can only read their own rows and set `read_at`. The header bell lists the latest 30.

**API keys and REST API.** `api_keys` stores name, display prefix (`cm_xxxxxxxx`), SHA-256 hash, scopes (`read`, `write`), expiry and revocation; the key is shown once. `/api/v1/{workspace,assets,changes,proposals}` authenticate `Authorization: Bearer` keys with the service role, and **every query filters by the key's workspace** (RLS is bypassed on this path). `POST /api/v1/changes` (write scope) creates a draft change with origin `api`; nothing can be approved or executed through the API. 120 requests/minute per key (in-memory, per instance). See API_DOCUMENTATION.md.

**Organization, usage, admin.** Settings gained Organization (rename, list/create workspaces within plan limits), API keys and Usage tabs. `/admin` is limited to `CHANGEMESH_PLATFORM_ADMIN_EMAILS` (404 otherwise) and shows aggregate counts only — no tenant content.

**Security headers.** `next.config.ts` adds a Content-Security-Policy (`default-src 'self'`, Supabase origins in `connect-src`, `frame-ancestors 'none'`, Stripe in `form-action`) and HSTS in production. Scripts still need `'unsafe-inline'` until nonce-based CSP is adopted.

**Demo mode.** Invitations, API keys, organization changes and payments are refused with a clear message; notifications and usage are computed from the session's sample data.

## 17. Production readiness (Stage 8)

- Rate limits (in-memory, per instance): sign-in 10 / 5 min and sign-up 5 / 10 min per address, demo sessions 30 / 10 min per address, scans, analyses, executions per actor, API 120 / min per key plus 360 / min per address.
- Error boundaries at the root and per workspace (the shell stays usable when one page fails).
- Acceptance flow covered by `tests/db/user-journey.test.ts` (real RPCs and RLS) and the demo E2E suite.
- Deployment and launch checklist: DEPLOYMENT.md. Results and untested areas: TEST_REPORT.md.

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
| Graph UI | React Flow (`@xyflow/react`) | ⏳ Stage 4 |
| Parsing | `unpdf` (PDF), `papaparse` (CSV), `node-html-parser` (HTML) | ✅ Stage 3 |
| AI | Provider abstraction; Claude when `ANTHROPIC_API_KEY` is set, deterministic engine otherwise | ⏳ Stage 5 |
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

## 13. Planned engines (designed, not built)

- **Dependency Graph (Stage 4):** graph service computed from DB rows; suggested relationships require human confirmation.
- **Change & Impact (Stage 5):** deterministic BFS impact engine with explainable relationship paths; AI provider interface with schema-validated JSON, retries and usage tracking; AI never approves anything.
- **Approval & Updates (Stage 6):** approval workflow on top of the existing constraints; internal update simulator and exportable instructions; idempotent execution.
- **Commercial SaaS (Stage 7):** Stripe test-mode billing, plan limits, invitations, notifications, usage metering, admin area.

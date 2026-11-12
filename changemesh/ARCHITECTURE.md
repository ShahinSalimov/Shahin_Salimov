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
| Components | shadcn/ui conventions (`components.json`, `cva`, Radix primitives via `radix-ui`, `lucide-react`) | ✅ base set |
| Auth | Supabase Auth (email + password, optional Google OAuth) via `@supabase/ssr` cookies | ✅ |
| Database | Supabase Postgres, Row Level Security on every table | ✅ |
| Migrations | SQL files in `supabase/migrations/`, applied with the Supabase CLI | ✅ |
| Validation | Zod at every input boundary (forms, env, DB rows) | ✅ |
| i18n | Typed dictionaries `en` (default), `az`, `tr`; cookie or `Accept-Language` | ✅ skeleton |
| Logging | Structured JSON logger with secret redaction and request ids | ✅ |
| Tests | Vitest (unit) + Vitest against real PostgreSQL (migrations + RLS) | ✅ |
| Graph UI | React Flow (`@xyflow/react`) | ⏳ Stage 4 |
| Parsing | `unpdf` (PDF), `papaparse` (CSV), `node-html-parser` (HTML) | ⏳ Stage 3 (installed) |
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

## 10. Planned engines (designed, not built)

- **Asset Intelligence (Stage 3):** SSRF-safe fetcher (DNS resolution, private-range blocking, size/time limits), PDF/CSV/HTML extraction into a normalized facts table (entity, attribute, value, source location, confidence, version). Scanned content is treated as untrusted data and never as instructions.
- **Dependency Graph (Stage 4):** graph service computed from DB rows; suggested relationships require human confirmation.
- **Change & Impact (Stage 5):** deterministic BFS impact engine with explainable relationship paths; AI provider interface with schema-validated JSON, retries and usage tracking; AI never approves anything.
- **Approval & Updates (Stage 6):** approval workflow on top of the existing constraints; internal update simulator and exportable instructions; idempotent execution.
- **Commercial SaaS (Stage 7):** Stripe test-mode billing, plan limits, invitations, notifications, usage metering, admin area.

# CHANGEMESH — Development Status

_Last updated: 2026-11-12 — after Stage 2 (Premium UI)._

## Roadmap

| # | Stage | Status |
|---|---|---|
| 1 | **Foundation** — architecture, database, authentication | ✅ Complete |
| 2 | **Premium UI** — design system, application shell, all pages | ✅ Complete |
| 3 | **Asset Intelligence** — documents, websites, extraction | ⏳ Next (awaiting instruction) |
| 4 | **Dependency Graph** — relationships between information | Queued |
| 5 | **AI Change Engine** — change detection, impact analysis | Queued |
| 6 | **Approval Engine** — approvals, update execution | Queued |
| 7 | **Commercial SaaS** — subscriptions, billing, roles, invitations | Queued |
| 8 | **Launch** — production-readiness audit, deploy, first customers | Queued |

Stage briefs 3–8 have been received and will be executed one at a time, only after explicit instruction.

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

### Recommended next stage

**Stage 3 — Asset Intelligence:** private file uploads (PDF/CSV) with size and type limits, SSRF-safe website scanning, text and structured-fact extraction into a normalized facts table, version tracking and honest scan statuses — replacing the "Planned · Stage 3" labels.

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


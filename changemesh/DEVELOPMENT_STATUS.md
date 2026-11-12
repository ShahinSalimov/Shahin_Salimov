# CHANGEMESH — Development Status

_Last updated: 2026-11-12 — after Stage 1 (Foundation)._

## Roadmap

| # | Stage | Status |
|---|---|---|
| 1 | **Foundation** — architecture, database, authentication | ✅ Complete |
| 2 | **Premium UI** — design system, application shell, all pages | ⏳ Next (awaiting instruction) |
| 3 | **Asset Intelligence** — documents, websites, extraction | Queued |
| 4 | **Dependency Graph** — relationships between information | Queued |
| 5 | **AI Change Engine** — change detection, impact analysis | Queued |
| 6 | **Approval Engine** — approvals, update execution | Queued |
| 7 | **Commercial SaaS** — subscriptions, billing, roles, invitations | Queued |
| 8 | **Launch** — production-readiness audit, deploy, first customers | Queued |

Stage briefs 2–8 have been received and will be executed one at a time, only after explicit instruction.

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

### Recommended next stage

**Stage 2 — Premium UI:** design system (typography, tokens, data-viz primitives, skeletons, empty states), responsive application shell with the requested sidebar, and all 16 pages wired to a data-access layer that serves real Supabase data for accounts and clearly labeled fixtures in demo mode.

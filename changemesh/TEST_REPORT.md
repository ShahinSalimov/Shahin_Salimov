# CHANGEMESH — Test Report

_Run: 2026-11-12, in the development container (Linux, Node 22, PostgreSQL 16.x, Chromium via Playwright). Commit: Stage 8 audit (see `git log`)._

## Summary

| Suite | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | ✅ 0 errors (TypeScript strict, `noUncheckedIndexedAccess`) |
| Lint | `npm run lint` | ✅ 0 problems |
| Unit tests | `npm test` | ✅ **258 / 258** passed (31 files) |
| Database tests | `npm run test:db` | ✅ **101 / 101** passed (9 files) |
| Production build | `npm run build` (clean `.next`) | ✅ success |
| End-to-end (demo) | `node tests/e2e/demo-flows.cjs` against `next start` | ✅ **68 / 68** checks passed |
| Responsive sweep | `node tests/e2e/responsive-sweep.cjs` | ✅ 87 page × viewport combinations, no horizontal overflow, no console errors |
| Dependencies | `npm audit --omit=dev` | ✅ 0 known vulnerabilities |

## What each suite covers

**Unit (Vitest, 258).** Domain logic: RBAC matrix, extraction (CSV, HTML, JSON-LD, PDF text, normalization), relationship suggestion and graph traversal, change detection, impact scoring and proposals, metrics, export (CSV formula-injection guard), billing (Stripe subscription mapping, plan fallback, usage lines). Server: env validation (secrets never echoed), SSRF guard and safe fetch (private ranges, redirects, size/time limits, decompression bombs), PDF/file handling, scan runner, graph service, AI analyzer guardrails and pricing, change engine, execution service, demo data isolation, tokens (API keys/invitations), Stripe test-key guard, **signed Stripe webhooks** (invalid signature, idempotency, stale events, unmapped price → retry, live events refused).

**Database (PostgreSQL 16 + Supabase shim, 101).** Every migration applied in order to a fresh database per file. Row Level Security for every table and role (owner/admin/editor/viewer/outsider/anonymous), cross-tenant denial, composite tenant keys, append-only audit, workflow RPCs (decisions, revisions, executions with idempotency and one-running guard), asset intelligence RPCs, graph uniqueness and immutability, change-analysis persistence, plan limits, invitations, notifications, API keys, usage metering, and the **new-customer journey** (`user-journey.test.ts`): register → organization + workspace → assets → scans → relationship → change → impact → approve → apply → invite teammate → audit trail and usage.

**End-to-end (Playwright, demo mode, 68).** Approve / reject (comment required) / request revision and revise; relationship review; add asset (validation + success); record change; role change and last-owner protection; rename; activity feed; mobile navigation; CSV/PDF uploads with real files (success, unsupported file → failed scan keeping the previous version, partial PDF); manual facts; website scans refused in demo; edit/delete with typed confirmation; graph (selection, depth, search, filters, suggestions, manual relationship, reverse-duplicate refusal, removal, list view); change analysis and inconsistency detection; execution, rollback, preview; update history and exports; notifications (bell, mark all read); demo refusals for invitations, API keys and checkout; usage, organization, pricing; API without key refused; unsigned webhook refused; `/admin` hidden; separate visitors get isolated sessions.

## Final requirement — "a new user can register, create a workspace, add assets, see relationships, detect a change, inspect impact and approve an update proposal"

| Step | Demo mode (UI, E2E) | Real accounts (database, RLS) | Real accounts (UI against Supabase) |
|---|---|---|---|
| Register | n/a (demo visitor) | ✅ `user-journey` step 1 | ⚠️ not run — no Supabase project here |
| Create workspace | n/a (sample workspace) | ✅ step 2 | ⚠️ not run |
| Add assets | ✅ | ✅ step 3 | ⚠️ not run |
| See relationships | ✅ | ✅ step 4 | ⚠️ not run |
| Detect change / inspect impact | ✅ | ✅ step 5 | ⚠️ not run |
| Approve update proposal | ✅ | ✅ step 6 | ⚠️ not run |

The requirement is **met in demo mode and at the database level**. It is **not yet demonstrated through the UI against a real Supabase project**, because neither Supabase, Docker nor a PostgREST binary is available in this environment (downloading PostgREST was blocked by the environment's safety policy pending the owner's permission).

## Not tested (honest list)

1. **Supabase PostgREST + Auth end-to-end.** The TypeScript data layer for real accounts (`SupabaseWorkspaceData`, commercial service, REST API) has not run against PostgREST. SQL behind it is tested; query-builder calls, embedded selects and RPC argument names are verified only by type checking and review.
2. **Stripe API calls.** Checkout and Billing Portal session creation were not executed (no Stripe test account). Webhook verification and processing were tested with real Stripe signatures.
3. **Claude API.** AI analysis was tested with mocked SDK responses; no real API call (no key).
4. **Supabase Storage** uploads of originals.
5. **Email delivery** (Supabase Auth emails; invitations have no email by design).
6. **Load / performance testing.** Workspace pages load a full snapshot per request; fine for hundreds of assets, untested beyond.
7. **Cross-browser.** E2E runs on Chromium only.
8. **Accessibility** was checked by structure (labels, roles, keyboard paths used by E2E), not with an automated a11y scanner or a screen reader.

## Issues found and fixed during the Stage 8 audit

| Issue | Fix |
|---|---|
| Sign-in and sign-up had no application-level rate limit | Per-address limits (10 sign-ins / 5 min, 5 sign-ups / 10 min) on top of Supabase's own limits |
| Demo sessions could be created without limit (memory pressure) | 30 demo sessions / 10 min per address (store was already capped at 500) |
| API rate limit was keyed by the public key prefix, so anyone knowing a prefix could exhaust that key's quota | Keyed by the full key's hash; added a per-address limit before key lookup |
| A failing page replaced the whole workspace shell | Workspace-level error boundary keeps navigation |
| Demo billing cards pointed to a Stripe portal that does not exist in demo | Cards state that payments are disabled in the demo |

## Verdict

**Not production-ready yet.** All automated suites pass, but the critical real-account path (Supabase Auth + PostgREST), Stripe session creation and Storage have not been executed end-to-end. Complete the staging verification in [DEPLOYMENT.md](./DEPLOYMENT.md) §4 first.

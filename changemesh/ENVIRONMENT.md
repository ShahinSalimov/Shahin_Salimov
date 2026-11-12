# Environment variables

Copy `.env.example` to `.env.local` (never commit it). Values are validated at runtime with Zod; an invalid value fails with the variable **name** only, never its value.

| Variable | Scope | Required | Default | Purpose |
|---|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | public | recommended | request host | Base URL used in auth email links, e.g. `https://app.example.com` (no trailing slash). |
| `NEXT_PUBLIC_SUPABASE_URL` | public | for real accounts | – | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | for real accounts | – | Supabase anon key. Public by design; all data is protected by RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | later stages | – | Bypasses RLS. Used only by trusted server jobs (webhooks, scans, invitations). Never expose, never prefix with `NEXT_PUBLIC_`. Not used by Stage 1 request paths. |
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | public | no | `false` | Shows "Continue with Google". Requires the Google provider in Supabase Auth. |
| `CHANGEMESH_DEMO_MODE` | server | no | `disabled` | `enabled` lets visitors explore fictional demo data without an account. |
| `LOG_LEVEL` | server | no | `info` | `debug`, `info`, `warn` or `error`. |
| `CHANGEMESH_AI_PROVIDER` | server | no | `none` | `claude` enables AI-assisted impact analysis. Without it every analysis is rule-based. |
| `ANTHROPIC_API_KEY` | **server only** | with AI | – | Claude API key. Never exposed to the browser. |
| `CHANGEMESH_AI_MODEL` | server | no | `claude-opus-5-5` | Claude model id for impact analysis. |
| `TEST_DATABASE_URL` | tests only | for `npm run test:db` | – | PostgreSQL superuser URL for migration/RLS tests. Each run creates and drops its own database. |

Later stages will add: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

## Behaviour without Supabase

If the Supabase variables are empty, the app starts normally, the login and signup pages state that authentication is not configured, and (when `CHANGEMESH_DEMO_MODE=enabled`) offer the demo. No fake sign-in is ever performed.

## Checking the configuration

`GET /api/health` returns `{ status, authConfigured, demoMode, time }` — flags only, no values.

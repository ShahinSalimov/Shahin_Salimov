# Installation (local development)

## Requirements

- Node.js 22+
- npm 10+
- A Supabase project (free tier is fine) for real accounts — optional for demo mode
- PostgreSQL 16 binaries for database tests (or Docker / any reachable PostgreSQL)

## 1. Install

```bash
cd changemesh
npm install
cp .env.example .env.local
```

## 2. Run in demo mode (no Supabase needed)

Keep `CHANGEMESH_DEMO_MODE=enabled` in `.env.local`, then:

```bash
npm run dev
```

Open http://localhost:3000 and click **Explore the demo**.

## 3. Connect Supabase (real accounts)

1. Create a project at supabase.com.
2. Apply the migrations — either:
   - **CLI:** `npx supabase link --project-ref <ref>` then `npx supabase db push`, or
   - **Dashboard:** SQL Editor → paste each file from `supabase/migrations/` in filename order → Run.
   Migration `…000400_storage.sql` creates the private `asset-files` Storage bucket and its policies (skipped automatically on plain PostgreSQL).
3. Project Settings → API: copy the URL and anon key into `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Copy the service-role key into `SUPABASE_SERVICE_ROLE_KEY` (server only).
4. Authentication → URL Configuration: Site URL = `http://localhost:3000`; add `http://localhost:3000/auth/callback` to Redirect URLs.
5. Authentication → Providers → Email: keep "Confirm email" on (recommended). Set minimum password length to 10.
6. Optional Google: enable the provider in Supabase, then set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`.
7. `npm run dev`, open `/signup`, confirm the email, and create your organization on the onboarding page.

## 4. Stripe (test mode, optional)

Billing works only with **test-mode** keys; live keys are refused.

1. In the Stripe dashboard (test mode) create one product per plan with a recurring monthly price; copy the price ids into `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_BUSINESS`, `STRIPE_PRICE_AGENCY`.
2. Copy the test secret key (`sk_test_…`) into `STRIPE_SECRET_KEY`.
3. Forward webhooks locally with the Stripe CLI and copy the printed signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe \
     --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed,invoice.payment_failed
   ```
4. Settings → Billing customer portal (test mode): enable plan switching between the three prices and cancellation.
5. Restart `npm run dev`, open Settings → Billing & plan as an organization owner and choose a plan. Pay with test card `4242 4242 4242 4242`. The plan changes after the webhook arrives.

## 5. Platform admin (optional)

Set `CHANGEMESH_PLATFORM_ADMIN_EMAILS=you@example.com` and open `/admin` while signed in with that email.

## 6. Quality checks

```bash
npm run typecheck   # TypeScript strict
npm run lint        # ESLint (next/core-web-vitals + typescript)
npm test            # unit tests

# Database tests: migrations + Row Level Security against real PostgreSQL
scripts/test-db.sh start
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:db
scripts/test-db.sh stop

npm run build       # production build
```

End-to-end checks (need Playwright with Chromium, and a running server with demo mode enabled):

```bash
npm run build && CHANGEMESH_DEMO_MODE=enabled npm start   # in another terminal
BASE_URL=http://localhost:3000 npm run test:e2e
```

`scripts/test-db.sh` uses PostgreSQL binaries from `/usr/lib/postgresql/16/bin` (override with `PGBIN`). With Docker instead:

```bash
docker run --rm -d -p 54329:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
```

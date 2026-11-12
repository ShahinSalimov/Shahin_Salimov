# Deployment

CHANGEMESH is a standard Next.js 16 Node application plus a Supabase project. This guide describes a deployment on **Vercel + Supabase + Stripe (test mode)**; any Node 22 host works the same way (`npm run build && npm start`).

> Read [TEST_REPORT.md](./TEST_REPORT.md) first. The Supabase PostgREST path and the Stripe API calls have not been exercised end-to-end in the development environment. Do the **staging verification** below before inviting customers.

## 1. Supabase (production project)

1. Create a project in the region closest to your users. Enable Point-in-Time Recovery or daily backups.
2. Apply every migration in `supabase/migrations/` in filename order (`npx supabase link --project-ref <ref>` then `npx supabase db push`).
3. Authentication → URL configuration:
   - Site URL: `https://app.example.com`
   - Redirect URLs: `https://app.example.com/auth/callback`
4. Authentication → Providers → Email: "Confirm email" on, minimum password length 10, leaked-password protection on. Configure a custom SMTP sender (Supabase's default sender is rate-limited and not meant for production).
5. Storage: migration `…000400_storage.sql` creates the private `asset-files` bucket. Confirm it exists and is **not** public.
6. Copy URL, anon key and service-role key for the environment variables below. Keep the service-role key out of any client code and logs.

## 2. Stripe (test mode)

This build accepts **test-mode keys only** (live keys are refused by design). Follow INSTALLATION.md §4, but create the webhook endpoint in the dashboard instead of the CLI:

- Endpoint URL: `https://app.example.com/api/webhooks/stripe`
- Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.payment_failed`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

Going live later requires a deliberate code change (removing the test-key guard in `src/server/commercial/stripe.ts` and the live-event refusal in `billing.ts`), validated prices, tax settings and terms of service.

## 3. Vercel

1. Import the repository, set **Root Directory** to `changemesh`. Framework preset: Next.js. Node 22.
2. Environment variables (Production and Preview): see [ENVIRONMENT.md](./ENVIRONMENT.md). Minimum for real accounts:
   `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CHANGEMESH_DEMO_MODE=disabled`.
   Optional: Stripe variables, `CHANGEMESH_AI_PROVIDER=claude` + `ANTHROPIC_API_KEY`, `CHANGEMESH_PLATFORM_ADMIN_EMAILS`, `LOG_LEVEL`.
3. Function duration: asset pages (`maxDuration = 60`) and change pages (`maxDuration = 120`, AI analysis) need a plan that allows these limits.
4. Deploy, then add the custom domain and update `NEXT_PUBLIC_APP_URL` and the Supabase Site URL to match.

### Serverless caveats

- **Demo mode** keeps each visitor's sample data in server memory. On serverless platforms requests can land on different instances, so demo edits may appear to reset. Run the demo on a single long-running Node instance, or keep `CHANGEMESH_DEMO_MODE=disabled` in production.
- **Rate limits** (auth, demo, scans, AI, API keys) are in-memory per instance. They stop bursts from one client, not distributed abuse. Client addresses come from `X-Forwarded-For`, which is trustworthy only behind a proxy that overwrites it (Vercel does); on a bare Node host put a reverse proxy in front. Add a shared store (e.g. Redis) or a WAF rule before public launch.

## 4. Staging verification (do this before customers)

Run these against the deployed staging URL with a fresh Supabase project:

| # | Step | Expected |
|---|---|---|
| 1 | `GET /api/health` | `authConfigured: true`, `demoMode: false` |
| 2 | Sign up, confirm email, create organization | Lands on the new workspace dashboard |
| 3 | Add a CSV asset and upload a price list | Scan succeeds, facts listed under Information |
| 4 | Add a PDF with the same item | Change Map → "Suggest relationships" proposes a link; confirm it |
| 5 | Record a change for that item | Impact analysis lists the PDF; a proposal is pending |
| 6 | Approve, then "Mark as applied" with a note | Update history shows the execution; audit log has every step |
| 7 | Invite a second email as editor; open the link in another browser | Joins the workspace; inviter gets a notification |
| 8 | Create a read API key; `curl /api/v1/assets` | Returns the workspace's assets only |
| 9 | Add a 26th asset on Starter | Refused with the plan-limit message |
| 10 | Checkout Business with card 4242… | Plan shows Business after the webhook; `/admin` shows the event |
| 11 | Second organization (other user) | Cannot see the first organization's data anywhere, including the API |

## 5. Operations

- **Logs:** structured JSON on stdout with a request id (`x-request-id`). Secrets are never logged.
- **Health:** `GET /api/health` for uptime checks.
- **Backups:** Supabase backups/PITR. Uploaded originals live in the `asset-files` bucket.
- **Migrations:** forward-only; apply with `supabase db push` before deploying code that needs them.
- **Rollback:** redeploy the previous Vercel build. Migrations are additive in this release.

## 6. Launch checklist

- [ ] All staging verification steps pass
- [ ] CI green (typecheck, lint, unit, database, build)
- [ ] Custom SMTP configured; email templates branded
- [ ] Demo mode disabled in production (or isolated on its own instance)
- [ ] Shared rate-limit store or WAF in place
- [ ] Privacy policy and terms published; data processing agreement for customers
- [ ] Prices validated (current prices are proposed test prices)
- [ ] Error monitoring (e.g. Sentry) connected to the JSON logs

# Vexora AI

AI image & video studio: Explore, Generator, discounted plans in 5 currencies, accounts, an owner-only **Cashbox** (Kassa) and legal pages. UI in 7 languages (default English, auto-detected from the browser).

## Layout

| Path | What |
|---|---|
| `artifacts/vexora-ai` | Web app (React 19 + Vite + Tailwind v4) |
| `artifacts/api-server` | API (Express 5): auth, generations, checkout/webhooks, admin |
| `lib/vexora-core` | Shared rules used by both: price book, currencies, models, credit cost, wire types |
| `lib/db` | Postgres schema (Drizzle): `vx_users`, `vx_sessions`, `vx_credit_ledger`, `vx_payments`, `vx_generations` |

## Run locally

```bash
pnpm install
export DATABASE_URL=postgresql://user@localhost:5432/vexora
pnpm --filter @workspace/db run push                 # create tables
ADMIN_EMAILS=you@example.com PORT=8080 pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/vexora-ai run dev            # http://localhost:5173, proxies /api → :8080
```

Register with an email listed in `ADMIN_EMAILS` → that account sees **Cashbox** in the account menu.

Static demo without a server (data lives in the visitor's browser, first account becomes admin):
`VITE_BACKEND=demo pnpm --filter @workspace/vexora-ai run build`

## Server environment

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | — (required) | Postgres connection string |
| `PORT` | — (required) | API port |
| `ADMIN_EMAILS` | empty | Comma-separated owner emails, promoted to admin on sign-in |
| `PAYMENT_PROVIDER` | `mock` in dev, `none` in production | `none` = payments closed (free launch); `mock` = simulated checkout; or a real adapter id |
| `AI_PROVIDER` | `mock` | Model vendor adapter id |
| `SIGNUP_ENABLED` | `true` | Set `false` to pause registrations |
| `SIGNUP_CREDITS` | `30` | Free credits for new accounts (real AI costs money — keep low) |
| `CORS_ORIGIN` | unset | Only if the web app is served from another origin |

`PAYMENT_PROVIDER=mock` is refused in production (it would give credits away).

## How money and credits flow

1. Client sends **what** to buy and the currency; the server prices it from `lib/vexora-core/src/pricing.ts` (client prices are never trusted).
2. A `pending` payment is stored, the provider adapter returns its hosted checkout URL; the customer pays there (card data never touches this server).
3. The provider calls `POST /api/webhooks/<provider>`; the adapter verifies the signature, then `markPaid` grants credits **once** (idempotent).
4. Credits are an append-only ledger; balance = sum. Generations debit under a row lock; failures/cancels refund automatically.
5. The provider pays out to the owner's bank account. Cashbox shows charged amounts per currency (before provider fees) and lets the owner refund and adjust credits.

## Connecting a real payment provider (after VÖEN)

Implement `PaymentProvider` in `artifacts/api-server/src/lib/payments/<name>.ts` (`startCheckout`, `parseWebhook`, `refund`), register it in `lib/payments/index.ts`, put its secret keys in server env vars, set `PAYMENT_PROVIDER=<name>`. No web-app change is needed: the checkout already follows `redirect` responses.

## Connecting a real AI model

Implement `AIProvider` in `artifacts/api-server/src/lib/ai/<name>.ts` (`submit`, `poll`, optional `cancel`), register it in `lib/ai/index.ts`, set `AI_PROVIDER=<name>`. Results with a `url` are shown as real media; the mock returns seeds rendered as synthetic art.

## Before launch

- Fill `src/config/site.ts` (owner name, support email). Legal texts in `src/legal/*` are drafts — have them reviewed.
- Review non-USD prices in `lib/vexora-core/src/pricing.ts` (TRY especially) and fill `REFERENCE_PRICES` in `src/data/pricing.ts`.
- Plan renewals: today a plan purchase grants one period of credits; monthly renewals should come from the provider's subscription webhooks.

## i18n

Languages: `en` (default), `az`, `tr`, `ru`, `de`, `es`, `fr`. Order: `?lang=` → saved choice → browser language → English. Add text to `src/i18n/locales/en.ts` first; a missing key in another locale fails `typecheck`. Cashbox texts are English + Azerbaijani only (`components/admin/adminText.ts`).

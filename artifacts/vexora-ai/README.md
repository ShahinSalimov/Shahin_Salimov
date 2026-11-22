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
cp artifacts/api-server/.env.example artifacts/api-server/.env   # edit DATABASE_URL, ADMIN_EMAILS
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/vexora-ai run dev            # http://localhost:5173, proxies /api → :8080
```

Register with an email listed in `ADMIN_EMAILS` → that account sees **Cashbox** in the account menu.

Static demo without a server (data lives in the visitor's browser, first account becomes admin):
`VITE_BACKEND=demo pnpm --filter @workspace/vexora-ai run build`

## Server environment

All keys are documented in `artifacts/api-server/.env.example` (copy to `.env`; `pnpm start` loads it).

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL`, `PORT` | — (required) | Postgres and API port |
| `ADMIN_EMAILS` | empty | Owner emails, promoted to admin (Cashbox) on sign-in |
| `PAYMENTS_ENABLED` | `true` dev / `false` prod | `false` = free launch, pricing shows "Coming soon" |
| `PAYMENT_MODE` | `sandbox` | `sandbox` = simulated gateway, no real cards · `live` = real gateway |
| `PAYMENT_GATEWAY` | `epoint` | `epoint` or `payriff` (live only) |
| `MERCHANT_ID`, `SECRET_KEY` | — | Merchant credentials (Epoint: public/private key; Payriff: secret key) |
| `CALLBACK_URL` | `<origin>/api/payment/callback` | Public HTTPS URL the gateway posts results to |
| `SUCCESS_URL`, `ERROR_URL` | `<origin>/payment/success`, `/payment/failed` | Where the customer returns; `order_id` is appended |
| `SIGNUP_CREDITS` | `30` | Free credits per new account |

Live mode refuses to start if a required key is missing; sandbox mode refuses to start in production.

## Payments (Epoint / Payriff / bank acquiring)

Code: `artifacts/api-server/src/services/payment/`

```
config.ts          env → settings + start-up validation
types.ts           PaymentGateway contract (createCheckout, parseCallback, refund?)
signature.ts       Epoint sha1 signature, sandbox HMAC, amount helpers
gateways/
  sandbox.ts       simulated gateway: hosted page = web /payment/sandbox, signed callbacks
  epoint.ts        Epoint adapter (data + signature form protocol)
  payriff.ts       Payriff adapter (order API; callback re-checked via GET /orders/{id})
orders.ts          createOrder (server-side price, AZN) and handleCallback (match, amount check, credit once)
fulfill.ts         markPaid / markFailed / markRefunded on the credit ledger
```

Flow:
1. Customer picks a plan or pack → **Pay** (web `CheckoutModal`).
2. `POST /api/payment/create` → the server prices the item in **AZN** (local gateways charge AZN), stores order `VX…`, asks the gateway for a checkout URL → the browser goes there.
3. Gateway → `POST /api/payment/callback` (signature or server-side lookup) → amount checked → credits granted once.
4. Customer returns to `/payment/success` or `/payment/failed`; the page polls `GET /api/payment/status/:orderId`, because the redirect can arrive before the callback.
5. Sandbox: `/payment/sandbox` shows a stand-in bank page; its buttons send a signed callback through the same code path.

**Before going live, verify each adapter against the gateway's current documentation.** The Epoint and Payriff protocols were written from prior knowledge without access to their docs; endpoints, field names and status values are isolated in the adapter files and marked "VERIFY". Make one real low-value payment in live mode before opening sales.

To add a bank's acquiring: implement `PaymentGateway` in `gateways/<bank>.ts`, register it in `services/payment/index.ts` and add its id to `GatewayId` in `config.ts`.

Refunds: gateways without a refund API are refunded in their merchant cabinet; the Cashbox **Refund** button then records it and removes the credits.

Hosting: `/payment/success`, `/payment/failed`, `/payment/sandbox` are real paths — the web host must serve `index.html` for unknown paths (SPA fallback).

## Compliance pages (required by local gateways)

Footer and the Contact page show the business details from `src/config/site.ts`: owner `[Sahibkarın Adı Soyadı / Fərdi Sahibkar]`, VÖEN, phone, email, address, plus Visa/Mastercard acceptance marks (`components/compliance/CardBrands.tsx` — replace with the official artwork from your acquirer).

Pages (7 languages, `src/legal/*`): Terms of Service, Privacy Policy (with a payment-security / PCI DSS section), Refund & Cancellation, Service Delivery (instant credit delivery), Contact.

Checklist before applying to a gateway:
- [ ] Fill every placeholder in `src/config/site.ts` (needs the VÖEN)
- [ ] Have the legal texts reviewed (the 14-day pack refund window and the 18+ age rule are draft choices)
- [ ] Site live on your own domain over HTTPS, legal pages reachable from the footer
- [ ] Official Visa/Mastercard marks from the acquirer

## Pricing that cannot lose money (`lib/vexora-core/src/economics.ts`)

- Each model has `vendorCostUsd` (per image, or per second by resolution for video).
- The cheapest a customer can ever pay for one credit (best yearly plan / biggest pack, USD and AZN books) minus the
  gateway fee (3.8 %) and tax (2 %, estimate — confirm with an accountant) is the credit's worst-case value.
- Credits charged = max(listed price, vendor cost ÷ (credit value × (1 − 50 % target margin))). Every model keeps ≥ 50 % margin by construction.
- Free credits (sign-up bonus, rewarded ads) can only be spent on models with `freeCredits: true` (cheap image models). Video always needs paid credits.
- Refunds are refused when the customer already used the credits (AI cost is already paid); the owner can still force one.
- The Cashbox shows a 30-day P&L (revenue − gateway − tax − AI cost − fixed costs + ad income) and the margin of every model.
- Admin-gifted credits are a real cost: AI spend from them appears in the P&L without revenue.

When a vendor price changes, update `vendorCostUsd`; credit prices follow automatically.

## Seedance 2.5 video (Replicate)

`REPLICATE_API_TOKEN` + `PUBLIC_BASE_URL` enable it (otherwise the simulator runs). Up to 45 s: the vendor makes ≤ 30 s
per call, so longer videos are split into near-equal parts (45 → 23 + 22), each part starting from the previous part's
last frame, then joined with ffmpeg (must be installed). Options: 480p/720p, sound, camera movement (written into the
prompt), reference image (product/logo/face). A background runner keeps jobs moving when the customer closes the tab;
failed or 30-minute-stuck jobs are refunded to the buckets they were paid from. Replicate input field names are isolated
in `lib/ai/replicate.ts → buildInput()` — verify them on the model's API page before going live.

## Rewarded ads (image credits only)

"Watch an ad → free credits" appears on Pricing, Profile and the image generator — never next to video.
Web: `VITE_ADS_PROVIDER=gpt` + `VITE_ADS_REWARDED_UNIT` (Google Ad Manager rewarded web ads), otherwise a sandbox test ad.
Server: daily cap, minimum watch time, rate limits; credits per view = ad revenue × (1 − margin) ÷ worst cost per free credit,
so ad credits always cost less than the ad pays. Update `ADS_REVENUE_PER_VIEW_USD` from your real AdSense numbers.

## Connecting a real AI model

Implement `AIProvider` in `artifacts/api-server/src/lib/ai/<name>.ts` (`submit`, `poll`, optional `cancel`), register it in `lib/ai/index.ts`, set `AI_PROVIDER=<name>`. Results with a `url` are shown as real media; the mock returns seeds rendered as synthetic art.

## Before launch

- Review non-USD prices in `lib/vexora-core/src/pricing.ts` (TRY especially) and fill `REFERENCE_PRICES` in `src/data/pricing.ts`.
- Plan renewals: today a plan purchase grants one period of credits; monthly renewals should come from the provider's subscription webhooks.

## i18n

Languages: `en` (default), `az`, `tr`, `ru`, `de`, `es`, `fr`. Order: `?lang=` → saved choice → browser language → English. Add text to `src/i18n/locales/en.ts` first; a missing key in another locale fails `typecheck`. Cashbox texts are English + Azerbaijani only (`components/admin/adminText.ts`).

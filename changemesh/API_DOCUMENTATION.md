# CHANGEMESH REST API (v1)

Base path: `/api/v1`. JSON in, JSON out. Available only when Supabase and `SUPABASE_SERVICE_ROLE_KEY` are configured (otherwise every endpoint answers `503 NOT_CONFIGURED`).

## Authentication

Create a key under **Settings → API keys** (workspace admins and owners). The full key is shown once; only its SHA-256 hash is stored.

```
Authorization: Bearer cm_ab12cd34_<43 characters>
```

- A key belongs to **one workspace**. Every query is filtered by that workspace; a key can never read another tenant's data.
- Scopes: `read` (all GET endpoints) and `write` (`POST /changes`). Read & write keys have both.
- Keys can expire (30 / 90 / 365 days or never) and can be revoked at any time. Revoked or expired keys get `401`.
- Rate limit: 120 requests per minute per key. Exceeding it returns `429` with `Retry-After`. The limiter is in memory per server instance (see DEVELOPMENT_STATUS.md).

## Errors

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Please check the highlighted fields.", "fieldErrors": { "title": ["Enter a short title."] } } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Body is not valid JSON |
| 401 | `UNAUTHENTICATED` | Missing, malformed, unknown, revoked or expired key |
| 403 | `FORBIDDEN` | Key lacks the required scope |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 64 KB |
| 422 | `VALIDATION_FAILED` | Invalid fields or filters |
| 429 | `RATE_LIMITED` | Rate limit exceeded |
| 500 | `INTERNAL` | Unexpected error (details are logged server-side, never returned) |
| 503 | `NOT_CONFIGURED` | Database or service key not configured |

## Pagination

List endpoints accept `limit` (1–200, default 50) and `offset` (default 0) and return:

```json
{ "data": [ ... ], "pagination": { "limit": 50, "offset": 0, "total": 132 } }
```

## Endpoints

### `GET /api/v1/workspace` — read

The key's workspace, effective plan and scopes.

```json
{ "data": { "id": "…", "name": "Harbor & Vine — Restaurants", "slug": "restaurants", "created_at": "…", "plan": "business", "scopes": ["read"] } }
```

### `GET /api/v1/assets` — read

Filters: `type` (`website`, `pdf`, `csv`, `manual`, `product_catalog`, `marketing_content`).
Fields: `id, type, name, description, source_url, status, scan_status, last_scanned_at, current_version, created_at, updated_at`. File contents and storage paths are never returned.

### `GET /api/v1/changes` — read

Filters: `status` (`draft`, `analyzing`, `analyzed`, `pending_approval`, `approved`, `rejected`, `completed`, `cancelled`).
Fields: `id, title, description, change_type, status, entity_name, attribute_name, old_value, new_value, source_asset_id, origin, analyzed_at, created_at, updated_at`.

### `POST /api/v1/changes` — write

Registers a change as a **draft** with `origin: "api"`. Impact analysis, approval and execution happen in the app by people with the right role — the API cannot approve or apply anything.

```bash
curl -X POST "$APP_URL/api/v1/changes" \
  -H "Authorization: Bearer $CHANGEMESH_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Classic Burger price","type":"updated","entityName":"Classic Burger","attributeName":"price","oldValue":"$12.00","newValue":"$15.00"}'
```

| Field | Required | Notes |
|---|---|---|
| `title` | yes | 2–200 characters |
| `type` | yes | `created`, `updated`, `deleted`, `conflicting`, `outdated` |
| `entityName`, `attributeName` | no | ≤ 200 characters; used by impact analysis |
| `oldValue`, `newValue`, `description` | no | ≤ 4000 characters |
| `sourceAssetId` | no | Must be an asset of the same workspace, otherwise 422 |

Response: `201` with the created change.

### `GET /api/v1/proposals` — read

Filters: `approval_status` (`pending`, `approved`, `rejected`, `needs_revision`).
Fields: `id, change_id, target_asset_id, current_value, proposed_value, reason, impact_level, approval_status, execution_status, created_at, updated_at`.

## Webhook (Stripe → CHANGEMESH)

`POST /api/webhooks/stripe` is for Stripe only. It verifies the `Stripe-Signature` header against `STRIPE_WEBHOOK_SECRET`, refuses live-mode events and processes each event id once. Handled types: `checkout.session.completed`, `customer.subscription.created|updated|deleted|paused|resumed`, `invoice.payment_failed` (logged; status arrives via `customer.subscription.updated`).

## Audit

Changes created through the API are recorded in the workspace audit log with actor type `system` (no user session) and origin `api` on the change. API key creation and revocation are audited with the acting admin.

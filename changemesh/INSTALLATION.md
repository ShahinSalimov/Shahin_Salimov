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
3. Project Settings → API: copy the URL and anon key into `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Copy the service-role key into `SUPABASE_SERVICE_ROLE_KEY` (server only).
4. Authentication → URL Configuration: Site URL = `http://localhost:3000`; add `http://localhost:3000/auth/callback` to Redirect URLs.
5. Authentication → Providers → Email: keep "Confirm email" on (recommended). Set minimum password length to 10.
6. Optional Google: enable the provider in Supabase, then set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`.
7. `npm run dev`, open `/signup`, confirm the email, and create your organization on the onboarding page.

## 4. Quality checks

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

`scripts/test-db.sh` uses PostgreSQL binaries from `/usr/lib/postgresql/16/bin` (override with `PGBIN`). With Docker instead:

```bash
docker run --rm -d -p 54329:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
```

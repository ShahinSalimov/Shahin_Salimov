# CHANGEMESH

**Every change. Every connection. One control center.**

CHANGEMESH is a B2B SaaS for business change management. When one piece of business information changes — a menu price, opening hours, an address, a product spec — it finds every website page, PDF, spreadsheet, catalog and marketing document that carries the same information, explains the impact and routes the updates through approval. Nothing external is ever modified without explicit approval.

> **Status:** Stage 1 (Foundation) complete. See [DEVELOPMENT_STATUS.md](./DEVELOPMENT_STATUS.md) for what works today and what is not built yet.

## Documentation

| File | Contents |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Stack, module layout, tenancy & security model, database |
| [INSTALLATION.md](./INSTALLATION.md) | Local setup, Supabase setup, running checks |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | Every environment variable |
| [DEVELOPMENT_STATUS.md](./DEVELOPMENT_STATUS.md) | Stage progress, test results, known issues |

## Quick start

```bash
cd changemesh
npm install
cp .env.example .env.local   # demo mode is enabled in the example file
npm run dev
```

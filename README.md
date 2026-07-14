# Olready CRM

Internal RM Lead Queue Platform for Olready bridal makeup marketplace.

## Stack

- Next.js 15 (App Router), TypeScript, Tailwind CSS v4
- PostgreSQL + [postgres.js](https://github.com/porsager/postgres) (no ORM)
- Auth: jose JWT in httpOnly cookies

## Quick start (mock mode)

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000/login — demo users (password `demo1234`):

| Email | Role |
|-------|------|
| rm.north@olready.in | Regional RM |
| commission@olready.in | Commission RM |
| uploader@olready.in | Lead Uploader |
| admin@olready.in | Admin |
| owner@olready.in | Owner |

Set `USE_MOCK_DATA=false` in `.env.local` when PostgreSQL is ready.

## Database (Supabase)

RM Platform tables live in the **`rm` schema** — your existing BDM/sales tables in **`public`** are untouched.

| Schema | Purpose |
|--------|---------|
| `public.*` | BDM sales CRM (leads, customers, subscriptions, …) |
| `rm.*` | Bridal RM queue (bride_leads, mua_pushes, staff, …) |

Optional link columns for later: `rm.muas.public_lead_id` → `public.leads.id`

```bash
# .env.local: DATABASE_URL from Supabase (pooler), USE_MOCK_DATA=false
npm run db:migrate    # applies db/schema-rm.sql
npm run db:seed       # staff users (kanika@olready.in / demo1234)
npm run db:seed-demo  # sample leads + MUAs (or use Admin → Configuration buttons)
npm run db:clean-demo # remove demo_seed rows only
```

## Callyzer call sync

Calls sync automatically on login (per staff Callyzer number). Manual refresh:

- **Staff:** click your name in the top bar → **Refresh Callyzer calls**
- **Admin:** Admin → Users → Edit user → **Refresh calls for this user**

Dev test:

```bash
node --env-file=.env.local scripts/manual-callyzer-cron-test.mjs [staffId]
```

## Integrations (webhooks)

POST with header `x-webhook-secret`:

- Callyzer: `POST /api/webhooks/callyzer` — body `{ "phone", "durationMinutes", "note?" }`
- Wati: `POST /api/webhooks/wati` — body `{ "phone", "text?" }`

Set `CALLYZER_WEBHOOK_SECRET` and `WATI_WEBHOOK_SECRET` in `.env.local`.

## PRD

See `Olready RM Platform PRD v1.1.docx` in repo root.

# Deployment Guide

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (Supabase) | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (Supabase) | Service role key (keep secret) |
| `GOOGLE_SPREADSHEET_ID` | Yes (Sheets/backup) | For sync backup |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Yes (Sheets) | JSON string of service account |
| `SESSION_SECRET` | Yes | Min 32 chars, random string |
| `NEXT_PUBLIC_APP_URL` | Prod | e.g. `https://your-domain.com` |
| `RESEND_API_KEY` | Digest | For daily email digest |
| `DAILY_DIGEST_FROM` | Digest | Sender email, e.g. `Olready <noreply@yourdomain.com>` |
| `DAILY_DIGEST_EMAILS` | Fallback | Comma-separated emails if no user emails |
| `CRON_SECRET` | Cron | Optional; required if you protect cron endpoints |

## Hosting options

### Vercel

1. Push to GitHub, connect repo to Vercel.
2. Add env vars in Project Settings → Environment Variables.
3. Deploy. The app uses Supabase as primary DB.

**Cron jobs (Vercel):** Vercel cron invocations do not auto-inject `CRON_SECRET`. Use one of:

- **External cron** (recommended): Use [cron-job.org](https://cron-job.org) or similar to hit:
  - `GET https://your-domain.com/api/cron/sync` – hourly (Supabase → Sheets)
  - `GET https://your-domain.com/api/cron/daily-digest` – daily 11 AM IST  
  Add header: `Authorization: Bearer <CRON_SECRET>` (same value as env var).

- **Vercel Pro / Cron:** If using Vercel Cron, configure the secret in the dashboard if supported.

### Railway / Render / VPS

1. Deploy with `npm run build && npm run start`.
2. Add env vars in the platform dashboard.
3. **Cron runs in-process:** `instrumentation-node.ts` schedules hourly sync and daily digest when the server starts. No external cron needed.

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Google Sheets sync

- **When:** Supabase is primary. Sync runs hourly (Supabase → Sheets) as backup.
- **Requirements:** `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY` (or path).
- **Script:** `scripts/sync-supabase-to-sheets.js` – invoked by cron or API.

## Daily digest email

- **When:** 11 AM IST (or on server start if after 11 AM).
- **Requirements:** `RESEND_API_KEY`. Add user emails in Admin → Users.
- **Fallback:** If no users have email, set `DAILY_DIGEST_EMAILS` for admin-style digest.

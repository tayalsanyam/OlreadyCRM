# Supabase Setup

## 1. Create Project

1. Go to [supabase.com](https://supabase.com) and create a project.
2. Note your **Project URL** and **Service Role Key** (Settings → API).

## 2. Run Migration

In Supabase SQL Editor, run the contents of `supabase/migrations/001_initial_schema.sql`.

Or use Supabase CLI:

```bash
npx supabase db push
```

## 3. Configure Env

Add to `crm/.env`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## 4. Seed Initial Data (Optional)

After migration, tables are empty. Create first admin via the app: visit `/login`, use setup flow if no admin exists.

For default plans/BDMs, add via Admin UI after login.

## 5. Sync to Google Sheets (Backup)

One-way sync Supabase → Sheets for support access:

```bash
cd crm && node scripts/sync-supabase-to-sheets.js
```

Requires: GOOGLE_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_KEY (or PATH). Sheet must have tabs: Users, BDMs, Plans, Teams, Leads, Activity, Tasks, BDM_Log. Run `scripts/setup-sheets.js` first if needed.

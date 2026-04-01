# Google Sheet Setup for Olready CRM

## 1. Create or Use a Sheet

Create a new Google Sheet, or use your existing one.

## 2. Share with Service Account

Share the Sheet with **Editor** access to:
```
olreadycrm@olready-crm.iam.gserviceaccount.com
```

## 3. Get the Sheet ID

From the URL:
```
https://docs.google.com/spreadsheets/d/1OKy3w9P1MTgvTAw_SoxFkjWhmu8LWM3n6077CBKI1bU/edit
                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                        This is your Sheet ID
```

Current sheet: [Olready CRM Superbase](https://docs.google.com/spreadsheets/d/1OKy3w9P1MTgvTAw_SoxFkjWhmu8LWM3n6077CBKI1bU/edit?usp=sharing)

## 4. Tab Structure

On first login (setup), the app will create these tabs if they don't exist:

| Tab      | Purpose                          |
|----------|----------------------------------|
| Users    | Login credentials, roles         |
| Leads    | All lead records                 |
| Activity | Lead activity log                |
| Tasks    | Follow-up tasks                  |
| BDM_Log  | Call tracking per BDM            |
| BDMs     | BDM names and revenue targets    |
| Plans    | Plan names and prices            |
| Teams    | Team Leader → BDM mappings       |

## 5. Existing Sheet Changes (if you have data)

If your Sheet already has a Leads tab with different columns:

- **Add** `company` (column D), `amount_paid`, `last_modified`
- **Align** status values: `UNTOUCHED`, `CONTACTED`, `FOLLOW UP/DETAILS SHARED`, `CONFIRMED`, `PAID`, `DENIED`
- Payment entry happens in the **Payment Pending** tab only, not on the Lead form

The app will append new leads with the full schema. Existing rows will work if they have at least: id, name, city, phone, status, plan, bdm, created_at.

## 6. Sync Supabase → Sheets (Backup)

One-way sync: Supabase → Google Sheets. Run from project root:

```bash
cd crm && node scripts/sync-supabase-to-sheets.js
```

**Where**: Terminal, from the `olready Excel CRM` project directory.

**When**: Run manually, or use the built-in hourly cron (see below).

### Hourly sync (automatic)

While the project is running, an hourly cron syncs Supabase → Sheets:

- **Local / VPS / Railway**: `instrumentation.ts` schedules a `node-cron` job every hour.
- **Vercel**: `vercel.json` triggers `/api/cron/sync` hourly. Set `CRON_SECRET` in env for auth.

**Requires**: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SPREADSHEET_ID`, and `GOOGLE_SERVICE_ACCOUNT_PATH` (or `GOOGLE_SERVICE_ACCOUNT_KEY`) in `crm/.env`.

On first run, the sync script will create the required tabs (Users, Leads, Activity, Tasks, BDMs, Plans, Teams, BDM_Log) automatically if they do not exist. For manual setup or header updates only, you can run `node scripts/update-sheet-structure.js` instead.

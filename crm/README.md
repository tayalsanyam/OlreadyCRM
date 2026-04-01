# Olready CRM

CRM for lead and pipeline management, backed by Google Sheets.

## Setup

1. **Create a Google Sheet** and share it with `olreadycrm@olready-crm.iam.gserviceaccount.com` (Editor).

2. **Copy the Sheet ID** from the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID/edit`

3. **Create `.env`** in the `crm` folder:

```
GOOGLE_SPREADSHEET_ID=your_sheet_id
GOOGLE_SERVICE_ACCOUNT_PATH=../olready-crm-10d9b5693b85.json
SESSION_SECRET=any-random-32-char-string
```

4. **Run**:
```bash
npm install
npm run dev
```

5. **Visit** http://localhost:3000/login – if no admin exists, create one.

## Deploy (Vercel)

**Recommended:** In the Vercel project go to **Settings → General**:

- **Root Directory:** `crm` (important: the Next app lives here, not the repo root)
- **Framework Preset:** Next.js
- **Build / Output:** leave defaults — do **not** set *Output Directory* to `public` (that mode is for static sites; Next.js uses `.next`)

If *Root Directory* is wrong, the build may finish but deployment fails looking for a `public` output folder.

The repo root has a `package.json` (npm **workspaces**) + root `vercel.json`, so Vercel can use **repository root** as the project root: it sees `next` in the root `package.json`, runs `npm install`, then `npm run build` (builds the `crm` workspace). You can still set **Root Directory** to `crm` instead and ignore the root `package.json` if you prefer.

## Features

- Login, Dashboard, Leads, Pipeline, Payment Pending, Tasks, Calendar, Reports, BDM Log, Activity Log, Admin
- Role-based access: Admin, Team Leader, BDM
- Payment recorded only in Payment Pending tab; auto PAID when full
- Auto task on next_follow_up; auto Untouched→Contacted when details + follow-up set
- Multi-stage filters, date presets, BDM Performance reports

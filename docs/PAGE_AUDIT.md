# Olready CRM – Page-by-Page Audit

Run after: `npm run build && npm run dev`  
Ensure `.env` has Supabase (or Sheets) configured.

---

## 1. Login (`/login`)

| Check | Action |
|-------|--------|
| First-time setup | No admin → shows "Create Admin" |
| Create admin | Username + password → POST /api/setup |
| Sign in | Username + password → POST /api/auth/login |
| Error display | Shows error message (not [object Object]) |
| Redirect | Success → `/` |

---

## 2. Dashboard (`/`)

| Check | Action |
|-------|--------|
| Load | GET /api/dashboard |
| Month selector | `<input type="month">` – filters Target & Revenue |
| Executive summary | Revenue, Expected, Conversion, Leads, Tasks |
| Payment overdue | Section + link to /payments |
| Deals in final stage | CONFIRMED with committed_date |
| Follow-up tasks | Overdue, Today, Upcoming |
| Today's action | Follow-ups + tasks due today |
| Target & Revenue | BDM stats, Admin totals, month label |

---

## 3. Leads (`/leads`)

| Check | Action |
|-------|--------|
| List | Multi-stage, BDM, search, date filters |
| Add Lead | Link to /leads/new |
| Edit | Link to /leads/[id] |
| last_modified | Shown in IST |

---

## 4. Lead Detail (`/leads/[id]`)

| Check | Action |
|-------|--------|
| Contact | City, Company, Phone, Email, Insta ID |
| Payment (read-only) | Selling price, Paid, Balance |
| Edit | Status, Remarks, Next follow-up, Original price, Discount, Lost reason (DENIED) |
| Tasks | Inline list, Add task, Mark done |
| Activity | Timeline with date/time |
| DENIED | Lost reason input shown |

---

## 5. New Lead (`/leads/new`)

| Check | Action |
|-------|--------|
| Form | Name, City, Company, Email, Phone, Insta ID, BDM, Plan, Status, Remarks |
| Duplicate phone | Error on create/update |
| Optional fields | Email, phone, insta_id optional |

---

## 6. Pipeline (`/pipeline`)

| Check | Action |
|-------|--------|
| Kanban | Columns by stage |
| Filters | BDM, dateFrom, dateTo |
| Drag to change | Drag card → drop in column → PATCH status |

---

## 7. Payment Pending (`/payments`)

| Check | Action |
|-------|--------|
| Rows | CONFIRMED + part-paid | balance > 0 |
| Overdue | Red/amber styling |
| Record Payment | Modal: amount, mode (CASH, BANK, UPI, etc.) |
| Filters | BDM, Plan, dateFrom, dateTo, Overdue |

---

## 8. Tasks (`/tasks`)

| Check | Action |
|-------|--------|
| Pending/Done | Two columns |
| Overdue | Highlighted |
| Mark done | Done button |
| Filters | BDM, dateFrom, dateTo |
| Link to lead | When lead_id present |

---

## 9. Calendar (`/calendar`)

| Check | Action |
|-------|--------|
| Month view | Prev/Next |
| BDM filter | Dropdown |
| Events | Follow-ups, Expected revenue, Paid |

---

## 10. Reports (`/reports`)

| Check | Action |
|-------|--------|
| KPIs | Total leads, Revenue, Conversion |
| BDM Performance | Table |
| Export CSV | Admin only (API enforced) |

---

## 11. BDM Log (`/bdm-log`)

| Check | Action |
|-------|--------|
| Add entry | BDM, date, total/connected/non-answered calls, talk time |
| List | Filters by BDM, date range |

---

## 12. Activity Log (`/activity-log`)

| Check | Action |
|-------|--------|
| Filters | dateFrom, dateTo, BDM, Type |
| Download CSV | Admin only (API enforced) |

---

## 13. Communications (`/communications`)

| Check | Action |
|-------|--------|
| Placeholder | Future integration message |

---

## 14. Admin (`/admin`)

| Check | Action |
|-------|--------|
| Config | BDMs, Plans, Targets |
| Users | Create user, Role, assigned_bdm (BDM), team_id (TL) |
| Teams | Add team, Add BDM to team |
| Import | CSV upload, column mapping |
| Seed | "Seed Sample Data" button in Config |

---

## Seed Data

1. Go to Admin → Config
2. Click "Seed Sample Data"
3. Creates: 3 BDMs, 3 plans, 3 teams, 5 leads (across stages), 4 tasks
4. One lead is PAID (Vikram Kumar)

---

## Backend Requirements

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Or** Google Sheets: `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY`
- **Session**: `SESSION_SECRET` (min 32 chars)

---

## Run Migration (Teams)

```bash
cd crm && npx supabase db push
```

Or run in Supabase SQL Editor:
```sql
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_team_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_team_id_bdm ON teams (team_id, bdm);
```

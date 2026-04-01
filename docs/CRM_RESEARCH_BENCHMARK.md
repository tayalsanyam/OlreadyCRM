# CRM Benchmark Research – Best-in-Class Features

Research on Zoho CRM, Pipedrive, GoHighLevel (GHL), HubSpot, Salesforce, and others to guide building a world-class CRM.

---

## 1. Dashboard Design & KPIs

### Layout & Customization
| Feature | Zoho | Pipedrive | GHL | HubSpot | Salesforce |
|---------|------|-----------|-----|---------|------------|
| Multi-tab dashboards | ✓ (10 tabs) | ✓ | ✓ Unlimited | ✓ | ✓ |
| Drag-and-drop widgets | ✓ | ✓ | ✓ | ✓ | ✓ |
| Theme/custom colors | ✓ | ✓ | ✓ | ✓ | ✓ |
| Role-based dashboards | ✓ | ✓ | ✓ | ✓ | ✓ |
| Drill-down in charts | ✓ | ✓ | ✓ | ✓ | ✓ |
| Export (CSV/Excel) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Scheduled email reports | ✓ | ✓ | ✓ | ✓ | ✓ |

### Recommended KPIs
- **Leading**: Calls/day, tasks completed, meetings booked, pipeline activity
- **Lagging**: Revenue, won deals, conversion rate, average deal size
- **Pipeline**: Stage distribution, win rate by stage, avg time in stage, bottleneck stages
- **Targets**: Revenue vs quota, BDM performance %, expected vs actual

### Dashboard Sections (best practice)
1. **Executive summary** – Revenue, conversion, pipeline value
2. **Pipeline by stage** – Deal count and value per stage
3. **Today’s action** – Follow-ups, tasks, meetings (user-specific)
4. **Deals in final stage** – Near-close deals with dates
5. **BDM/rep performance** – Target vs achieved, activity
6. **Tasks** – Pending, overdue, completion %

---

## 2. Pipeline & Stages

### Core Pipeline Features
- Custom stages per pipeline
- Drag-and-drop stage changes
- Stage-specific fields and automation
- Multiple pipelines (e.g. sales, renewals, services)

### Common Stage Naming (Olready-style mapping)
| Order | Stage |
|-------|-------|
| 1 | Untouched |
| 2 | Contacted |
| 3 | Follow up / Details shared |
| 4 | Confirmed |
| 5 | PAID / DENIED |

### Pipeline Views
- Kanban (card view)
- List view with filters
- Forecast view (expected revenue by stage/date)

---

## 3. Tasks & Activity Management

### Task Types
- **Tasks** – To-dos with due date, assignee, done/not done
- **Events** – Blocked time (meetings, calls)
- **Activities** – Logged actions (notes, calls, emails)

### Task Features
- Due date, time, reminders
- Link to lead/contact/deal
- Assignee and creator
- Status: Pending, Done, Overdue
- Overdue highlighting

### Activity Log
- Every interaction with date/time (IST)
- Type: Call, Email, Note, Meeting, Status change
- Mandatory: Status, Remarks, Next connect/stage on edit
- Visible on lead page (last activity + full list)
- Downloadable/exportable log

### Follow-up Reminders
- Today’s follow-ups
- This week
- Overdue
- Calendar sync (Google/Outlook)

---

## 4. Calendar Tab – Absolute Calendar

### Core
- **Full calendar view** – Month, week, day
- **BDM filter** – Filter by BDM or view all

### Events Shown on Calendar
| Type | Source | Description |
|------|--------|-------------|
| **Follow-ups** | `next_follow_up` | Upcoming follow-up dates |
| **Tasks** | Tasks with due date | Future tasks, pending |
| **Payments / Confirmed** | `committed_date` | Expected payment/commitment dates |
| **Plans sold** | Leads marked PAID | When deal closed |

### Custom Period
- Custom date range for calendar view
- Set start/end for any tag or filter

### Integrations
- Google Calendar, Outlook
- Prevent double-booking
- Availability rules

---

## 5. User Roles & Permissions

### User Types
- **Admin** – Full access, manage users, config, export, plans, BDMs, targets, team leaders
- **Team Leader** – Sees leads of BDMs in their team; reports, targets; no config/edit
- **BDM / Rep** – Own leads only (filtered by `assigned_bdm`)

### Admin Config (Admin Only)
- **Plans & price** – Add/edit/delete plans with price
- **BDM & targets** – Add/edit BDMs, set target revenue
- **Create users** – Username, password, role (Admin/Team Leader/BDM)
- **Create team leaders** – Assign BDMs to team; TL sees team leads only

### Permission Model (Zoho-style)
| Level | Scope |
|-------|--------|
| Profile | Create, read, edit, delete by module |
| Record | Own vs team vs all |
| Field | Hide sensitive fields (e.g. phone) |
| Module | Turn modules on/off per role |

### Key Permissions
- Export data – Admin only
- Edit BDM targets – Admin only
- Edit plans/pricing – Admin only
- Create users – Admin only
- Create team leaders – Admin only
- View all leads – Admin; Team Leader (team); BDM (own)

---

## 6. Lead & Contact Management

### Lead Fields
- Name, email, phone (optional until added)
- City/company, source
- BDM, plan, status
- Insta ID, notes/remarks

### Last Change on Leads
- Show **last modified** date/time (IST) on lead row and lead detail
- Sort leads by last modified
- Helps identify stale vs active leads

### Pricing (on lead)
- Original price, discount → auto **Selling price**
- Amount paid, payment status → auto **Balance**
- Payment mode: Cash, Bank, UPI, Credit Card, Payment Link

### Expected Revenue Logic
- If (original - discount) entered → use selling price
- Else → use plan price

### Phone Numbers
- Optional on add
- Editable later
- Mask or hide for non-admin if needed

### From Excel Files (DECEMBER HOT LEADS, SALES FORECAST)

**Lead type / MUA**
- **MUA** (Makeup Artist) – lead category. Add optional `lead_type` or `category` (MUA, etc.) if needed.

**Plan naming**
- Plans often include price: "pro 14k", "phoenix 20k", "prime 7k"
- Config/Plans: support plan names with embedded price and parse for display.

**Contact/date tracking**
- "1st Dec", "4th feb" columns = date of contact. Map to `connected_on` or add `last_contacted` for multi-touch.

**Segment/category tabs**
- Excel tabs: DENIED DATA, COVID MUA, JANUARY CLOSING
- Support **lead tags** or **segment** filter (e.g. DENIED, COVID_MUA, JAN_CLOSING) for similar views.

**Forecast matrix**
- SALES FORECAST uses date columns (4th feb, etc.) = expected close date per lead
- Add **Forecast view**: leads by `committed_date` / `next_follow_up`, BDM × Date matrix

**Experience / budget in remarks**
- "1 year bhd 15k", "4 years bhd 35k" often in remarks
- Optional fields: `experience`, `budget` – or keep in remarks

---

## 7. Reporting & Filters

### Date Filters
- Month to date
- Previous month
- Week to date
- Previous week
- **Custom date range** (applies to all tags and filters)

### Custom Periods
- **Custom period for all tabs** – Set start/end date once, applies to Leads, Reports, Calendar, etc.
- Per-section override where needed

### Filters
- **Stage** – Multi-select; 2–3+ stages at once (e.g. Contacted + Follow up)
- BDM filter
- Plan filter
- Date range

### Report Types (All Downloadable)
- Pipeline by stage
- Revenue vs expected
- Conversion rate
- Activity summary
- Lead list (filtered)
- Payment report
- Follow-up report

### Reports – BDM Performance Tab
| Column | Description |
|--------|-------------|
| **BDM** | BDM name |
| **Target** | Target revenue for period |
| **Expected Revenue** | Pipeline value (confirmed + follow-up) |
| **Achieved** | Revenue received (PAID) |
| **Achievement %** | Achieved / Target × 100 |
| **Custom period** | Filter by date range |

---

## 8. Accounting & Payments

### Payment Types
- **Full payment** – Sold, fully paid (balance = 0)
- **Part payment** – Partial received; balance due (if_part flag)
- **Payment mode**: CASH, BANK, UPI, CREDIT CARD, PAYMENT LINK

### Payment Fields
- Payment status (PENDING, RECEIVED, COMPLETE)
- Payment mode (CASH, BANK, UPI, CREDIT CARD, PAYMENT LINK)
- Amount paid, amount balance
- **if_part** – Part payment flag (balance > 0)

### Payment Pending Tab
- **Separate tab** – Leads with part payment or confirmed + balance due
- Columns: Lead, BDM, Plan, Selling price, Paid, **Balance due**, **Expected date**
- Filter by BDM, date range
- Downloadable

### Accounting Integration (future)
- QuickBooks, Xero
- One-way: CRM → Accounting
- Two-way: sync invoices, payments

---

## 9. Integrations

### Automation (n8n, Zapier)
- Webhooks for create/update/delete
- REST API for all entities
- Triggers: New lead, status change, payment
- Actions: Create task, send email, update sheet

### AI
- Lead scoring
- Next-best-action
- Meeting scheduling
- Chat/email summarization

### Other
- Google Sheets (current backend)
- Calendars (Google, Outlook)
- Email (Gmail, Outlook)
- SMS (Twilio, etc.)

---

## 10. BDM-Specific Features

### BDM Call Log (per BDM tab or filter)
- Date
- Total calls
- Connected calls
- Non-answered calls
- Total talk time

### BDM Targets
- Target revenue (editable by admin only)
- Achieved revenue
- % of target
- Expected revenue in pipeline

---

## 11. Data Operations

### Export
- Admin only
- CSV/Excel
- Filtered by date, stage, BDM
- All report types downloadable

### Import
- **Lead import** – Bulk import leads from CSV/Excel
- Column mapping (name, email, phone, city, BDM, plan, etc.)
- Validation and preview before import
- Duplicate handling (skip or update)
- **Excel format support** – Handle DECEMBER HOT LEADS / SALES FORECAST structure:
  - Variable columns by sheet (Name/MUA, City, Phone, Status, Plan, Remarks)
  - BDM from sheet name when column missing (GAURAV, GURKIRAN, etc.)
  - Date-style values ("1st Dec") → map to connected_on or created_at

---

## 12. UX & Performance

### Speed
- Lazy load lists
- Pagination or infinite scroll
- SWR/cache for API calls
- 5s polling for live sections (optional)

### Mobile
- Responsive layout
- Touch-friendly
- Essential actions on small screens

---

## Summary – Feature Checklist for Olready CRM

| Category | Features |
|----------|----------|
| **Dashboard** | KPIs, pipeline bars, deals in final stage, follow-ups, BDM targets, tasks summary, export (admin) |
| **Pipeline** | Untouched, Contacted, Follow up, Confirmed, PAID, DENIED |
| **Tasks** | Pending/Done, due date, overdue, link to lead |
| **Activity** | Log on lead page, IST timestamps, mandatory status/remarks/next connect on edit |
| **Calendar** | Absolute calendar; tasks, follow-ups, payments/confirmed; BDM filter; custom period; month/week/day |
| **Leads** | Last change visible; import from CSV/Excel |
| **Payments** | Full/part payment, if_part; Payment Pending tab (balance due, expected date) |
| **Pricing** | Auto selling price, auto balance, expected = selling or plan |
| **Reports** | All types downloadable; BDM tab (Target, Expected, Achieved, Achievement %); custom period |
| **Filters** | Date presets, custom range, multi-stage; custom periods for all tabs |
| **Roles** | Admin (all + export + config), BDM (own data) |
| **Integrations** | n8n webhooks, REST API, Google Sheets |
| **BDM Log** | Daily calls, connected, non-answered, talk time |
| **From Excel** | MUA/lead type, segment tags, forecast matrix, flexible import for BDM-tab format |

---

## Appendix: Excel File Structure Reference

### DECEMBER HOT LEADS - SALES .xlsx
- **Tabs**: DENIED DATA, JANUARY CLOSING, COVID MUA, GAURAV, GURKIRAN, HARSHA, VISHAL, TRISHNA, SIMRAN
- **Columns** (varies): Name/MUA, City, Phone, Status, Plan, Remarks, Date (1st Dec, 2nd Dec…)
- **BDM** from tab name when not in row

### SALES FORECAST _ FEBRUARY 2026.xlsx
- **Tabs**: JAN FINAL STATUS, GAURAV, GURKIRAN, HARSHA, SIMRAN, TRISHNA, VISHAL
- **Headers**: MUA, BDM, CITY, PHONE, STATUS, PLAN, REMARKS + date columns (4th feb, etc.)
- **Forecast matrix**: Date columns = expected close/follow-up per lead

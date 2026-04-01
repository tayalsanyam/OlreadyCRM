# Olready CRM – Final Build Specification

Single consolidated checklist of everything to build.

---

## 1. Configuration (Admin Only)

### Plans & Pricing
- **Add / Edit / Delete plans**
- Plan name (e.g. "Phoenix 18k", "Prime 7k")
- Price (₹)
- Stored in Config sheet or BDMs sheet

### BDM & Targets
- **Add / Edit / Delete BDMs**
- BDM name
- **Target** (revenue for period) – editable by Admin only
- Stored in Config/BDMs sheet

### User Management
- **Create new users** – Admin only
- Username, password (bcrypt), role
- **Roles**: Admin, Team Leader, BDM
- **assigned_bdm** – which BDM this user is (for BDM role) or which team they lead (for Team Leader)

### Team Leaders
- **Create Team Leader** – Admin only
- Team Leader sees: all leads of BDMs under their team
- Assign BDMs to a Team Leader (e.g. Team Leader "Gaurav" → BDMs: [GAURAV, GURKIRAN])
- Team Leader can: view team reports, targets, pipeline; cannot edit config/plans/BDM targets

---

## 2. Access Control

| Role | Leads | Config | Export | Create Users | BDM Targets | Plans |
|------|-------|--------|--------|--------------|-------------|-------|
| **Admin** | All | ✓ Edit | ✓ | ✓ | ✓ | ✓ |
| **Team Leader** | Team only | ✗ | ✗ | ✗ | ✗ | ✗ |
| **BDM** | Own only | ✗ | ✗ | ✗ | ✗ | ✗ |

- **BDM**: `assigned_bdm` = their BDM name; sees only their leads
- **Team Leader**: sees leads where `bdm` in their team list
- **Admin**: sees all, does everything

---

## 3. Pages & Tabs

| Page | Purpose |
|------|---------|
| **Login** | Username/password (Users sheet) |
| **Dashboard** | KPIs, pipeline, deals in final stage, follow-ups, tasks, BDM targets |
| **Leads** | List, filters, last modified, add/edit, activity on lead page |
| **Pipeline** | Kanban: Untouched → Contacted → Follow up → Confirmed → PAID / DENIED |
| **Payment Pending** | Lists confirmed + part-paid; **Record Payment** here (not in Leads); auto PAID when full |
| **Tasks** | Pending/Done, due date, overdue, link to lead |
| **Calendar** | Month/week/day; follow-ups, tasks, payments, confirmed; BDM filter; custom period |
| **Reports** | Pipeline, revenue, conversion, activity; BDM Performance tab; all downloadable |
| **BDM Log** | Per BDM: total calls, connected, non-answered, talk time |
| **Activity Log** | All interactions, IST timestamps, downloadable |
| **Admin** | Plans, BDMs, targets, users, team leaders |

---

## 4. Leads

### Fields
- id, name, city, company, email, phone (optional), insta_id
- bdm, plan, status, source
- remarks, connected_on, next_follow_up, committed_date
- original_price, discount, amount_paid, amount_balance
- payment_status, payment_mode (Cash, Bank, UPI, Credit Card, Payment Link)
- if_part (part payment flag – balance > 0), created_at, last_modified

### Payment on Lead
- **Display only** – Lead page shows payment info (paid, balance, mode) as read-only
- **Entry in Payment Pending tab** – Recording payment happens there; updates flow back to lead

### Auto-calc
- **Selling price** = original_price − discount
- **Balance** = selling_price − amount_paid
- **Expected revenue** = selling_price if entered, else plan price

### On Edit (Mandatory)
- Status, Remarks, Next connect or stage change

### Visibility
- Last modified (IST) on list and detail
- Sort by last modified

### Auto Status Changes
| Trigger | Change |
|---------|--------|
| **Untouched → Contacted** | When lead has core details (name, city, etc.) AND `next_follow_up` is set |
| **Confirmed → PAID** | When full payment recorded in Payment Pending tab |
| **Confirmed → Part paid** | When partial payment recorded (balance > 0) |

### Follow Up → Task
- When `next_follow_up` is set or updated → **auto-create task**:
  - Title: "Follow up: [Lead name]"
  - Due date: `next_follow_up`
  - Assignee: BDM of the lead
  - Linked to lead

---

## 5. Pipeline Stages

- Untouched → Contacted → Follow Up / Details shared → Confirmed → **PAID** / **DENIED**

---

## 5a. Payments – Entry & Flow

### Where Payment Is Recorded
- **Not on Lead form** – Payment is recorded in the **Payment Pending** tab only
- Confirmed leads appear in Payment Pending → user clicks "Record Payment" → enters amount, mode → status auto-updates

### Auto Transitions (Confirme → PAID / Part Paid)
| Action | Result |
|--------|--------|
| Record payment = selling price | Status → **PAID** |
| Record payment < selling price | Status stays **Confirmed**; if_part = true; balance updated |
| Record more (top-up) later | When balance = 0 → Status → **PAID** |

### Payment Pending Tab (Lists & Entry)
- **Shows**: Confirmed + not paid, Part paid (balance > 0)
- **Columns**: Lead, BDM, Plan, Selling price, Amount paid, Balance due, Expected date
- **Action**: "Record Payment" per row – opens modal to enter amount + mode; updates lead; status auto-updates
- Filter by BDM, date range; downloadable

---

## 6. Filters

### Leads Tab – Multi Filters
- **Stage** – Multi-select; choose 2–3 (or more) stages at once to view combined (e.g. Contacted + Follow up + Confirmed)
- **BDM** – Single or all
- **Plan** – Filter by plan
- **Date** – created, last modified, next_follow_up, committed_date
- **Custom period** – Date range

### All Tabs
- **Date**: Month to date, Previous month, Week to date, Previous week, **Custom**
- **Custom period** – applies across Leads, Reports, Calendar

---

## 7. Reports

- Pipeline by stage
- Revenue vs expected
- Conversion rate
- Activity summary
- Lead list, Payment report, Follow-up report
- **BDM Performance**: BDM | Target | Expected | Achieved | Achievement % | Custom period
- **All downloadable** (Admin only for full export)

---

## 8. Data

### Import
- CSV/Excel
- Column mapping, validation, duplicate handling
- Support DECEMBER HOT LEADS / SALES FORECAST format (variable columns, BDM from sheet)

### Export
- Admin only
- CSV/Excel by filters

---

## 9. Google Sheets Backend

### Tabs
- **Users** – id, username, password_hash, role, assigned_bdm, team_lead (optional)
- **Leads** – full lead schema
- **Activity** – date, lead_id, action, user, notes, created_at
- **Tasks** – task/title, due, assignee, done, lead_id
- **BDM_Log** – date, bdm, total_calls, connected_calls, non_answered_calls, talk_time
- **Config** – bdm, target, plan (BDMs + plans in one or separate structure)

### Optional: Team Leaders
- **Teams** – team_leader_id, bdm (which BDMs under this TL)
- Or: Users.assigned_bdm = "TEAM_GAURAV" and Teams maps TEAM_GAURAV → [GAURAV, GURKIRAN]

---

## 10. Integrations

- **n8n / Zapier** – Webhooks, REST API
- **Google Sheets** – Primary storage
- **Future**: QuickBooks, Xero, AI

---

## Build Order (Suggested)

1. **Auth & config** – Login, Users, Config (plans, BDMs, targets), Admin config UI
2. **User roles** – Admin, Team Leader, BDM; access control
3. **Leads** – CRUD, multi-stage filters, last modified, activity; auto Untouched→Contacted when details+follow_up set
4. **Pipeline** – Kanban, stages
5. **Payment Pending** – List; Record Payment action; auto Confirmed→PAID on full payment
6. **Tasks** – CRUD, pending/done, overdue; auto-create on next_follow_up set
7. **Dashboard** – KPIs, deals, follow-ups, tasks, BDM targets
8. **Calendar** – Events, BDM filter, custom period
9. **Reports** – All report types, BDM Performance tab, export
10. **BDM Log** – Per-BDM call tracking
11. **Import** – Excel/CSV with mapping
12. **Activity Log** – Global view, downloadable

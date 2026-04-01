# Olready CRM – Execution Plan

Complete build specification, schema, flows, and validation checklist.

---

## 1. Google Sheets Structure

### Required Tabs (create if missing)

| Tab | Headers | Purpose |
|-----|---------|---------|
| **Users** | id, username, password_hash, role, assigned_bdm, team_id | Auth + role mapping |
| **Leads** | Full schema (see below) | Lead records |
| **Activity** | id, lead_id, date, time, action, user, notes, status, remarks, next_connect | Activity log |
| **Tasks** | id, title, due, assignee, done, lead_id | Tasks |
| **BDM_Log** | id, bdm, date, total_calls, connected_calls, non_answered_calls, talk_time | Call tracking |
| **BDMs** | bdm, target | BDM names + revenue targets |
| **Plans** | plan, price | Plan names + prices |
| **Teams** | team_id, team_name, bdm | Maps BDMs to Team Leaders |

### Leads Sheet – Column Layout (A–X)

| Col | A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W | X |
|-----|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
| Field | id | name | city | company | email | phone | insta_id | bdm | plan | status | source | remarks | connected_on | next_follow_up | committed_date | original_price | discount | amount_paid | amount_balance | payment_status | payment_mode | if_part | created_at | last_modified |

### Status Values (Pipeline)

```
UNTOUCHED → CONTACTED → FOLLOW UP/DETAILS SHARED → CONFIRMED → PAID | DENIED
```

### Payment Modes

`CASH` | `BANK` | `UPI` | `CREDIT_CARD` | `PAYMENT_LINK`

---

## 2. Sheet Changes You May Need

1. **Add column `company`** (D) to Leads – spec includes it.
2. **Rename/ensure `amount_paid`** (not `amount`) – spec uses amount_paid.
3. **Add `last_modified`** (X) – auto-updated on every lead edit.
4. **Add Teams tab** – if using Team Leaders: team_id, team_name, bdm (one row per BDM in a team).
5. **Users: add `team_id`** – for Team Leader role (which team they lead).

Setup script will create/align tabs. Share the Sheet with `olreadycrm@olready-crm.iam.gserviceaccount.com` (Editor).

---

## 3. Flow Diagrams

### 3.1 Lead Edit → Auto Status (Untouched → Contacted)

```
User edits lead
  ├─ Core details present? (name, city, phone or email)
  └─ next_follow_up set?
       └─ YES → status = CONTACTED
```

### 3.2 next_follow_up → Auto Task

```
User sets/updates next_follow_up on lead
  └─ Create task:
       title: "Follow up: [Lead name]"
       due: next_follow_up
       assignee: lead.bdm
       lead_id: lead.id
```

### 3.3 Payment Recording (Payment Pending tab only)

```
User clicks "Record Payment" on Payment Pending row
  → Modal: amount, payment_mode
  → Update lead: amount_paid += amount, amount_balance = selling_price - amount_paid
  → If amount_paid >= selling_price: status = PAID, payment_status = COMPLETE
  → Else: if_part = true, payment_status = PARTIAL
  → Add Activity entry
```

### 3.4 Access Control

| Role | Leads filter | Config | Export | Admin |
|------|-------------|--------|--------|-------|
| Admin | All | ✓ | ✓ | ✓ |
| Team Leader | bdm in team | ✗ | ✗ | ✗ |
| BDM | assigned_bdm = lead.bdm | ✗ | ✗ | ✗ |

---

## 4. API Routes

| Route | Methods | Auth | Notes |
|-------|---------|------|-------|
| /api/auth/login | POST | — | Returns session |
| /api/auth/logout | POST | — | Clear session |
| /api/auth/me | GET | cookie | Current user |
| /api/setup/check | GET | — | Sheet + admin user exists |
| /api/config | GET, PATCH | admin | BDMs, Plans, Targets |
| /api/config/dropdowns | GET | ✓ | bdms, plans for forms |
| /api/users | GET, POST | admin | CRUD users |
| /api/users/[id] | PATCH, DELETE | admin | — |
| /api/teams | GET, POST | admin | Team Leader mappings |
| /api/leads | GET, POST | ✓ | Role-filtered, multi-stage filters |
| /api/leads/[id] | GET, PATCH | ✓ | — |
| /api/leads/[id]/activity | GET | ✓ | — |
| /api/leads/export | GET | admin | CSV by filters |
| /api/leads/import | POST | admin | CSV/Excel mapping |
| /api/payments/pending | GET | ✓ | Confirmed + part-paid leads |
| /api/payments/record | POST | ✓ | Record payment, update lead |
| /api/tasks | GET, POST | ✓ | — |
| /api/tasks/[id] | PATCH | ✓ | — |
| /api/dashboard | GET | ✓ | KPIs, pipeline, follow-ups, tasks |
| /api/calendar/events | GET | ✓ | Follow-ups, tasks, payments |
| /api/reports | GET | ✓ | Pipeline, revenue, BDM perf |
| /api/bdm-log | GET, POST | ✓ | — |
| /api/activity/log | GET | ✓ | All activity, downloadable |
| /api/webhook | POST | — | n8n/Zapier |

---

## 5. Pages & Routes

| Page | Route | Purpose |
|------|-------|---------|
| Login | /login | Username/password |
| Dashboard | / | KPIs, pipeline, follow-ups, tasks |
| Leads | /leads | List, multi-filters, add/edit |
| Lead Detail | /leads/[id] | Edit, activity, payment display-only |
| New Lead | /leads/new | Create lead |
| Pipeline | /pipeline | Kanban by stage |
| Payment Pending | /payments | Record payment only |
| Tasks | /tasks | Pending/done, overdue |
| Calendar | /calendar | Events, BDM filter |
| Reports | /reports | BDM Performance, export |
| BDM Log | /bdm-log | Call tracking |
| Activity Log | /activity-log | All activity |
| Admin | /admin | Plans, BDMs, users, teams |

---

## 6. Build Order (Execution Phases)

1. **Phase 1**: Auth, Users, Config (BDMs, Plans, Targets), Teams, Admin UI, role middleware
2. **Phase 2**: Leads CRUD, multi-stage filters, activity log, auto Untouched→Contacted
3. **Phase 3**: Pipeline Kanban, Payment Pending page + Record Payment flow
4. **Phase 4**: Tasks CRUD, auto-create on next_follow_up
5. **Phase 5**: Dashboard, Calendar, Reports
6. **Phase 6**: BDM Log, Activity Log, Import/Export
7. **Phase 7**: Validate, refine, polish UI

---

## 7. Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** + decent component styling
- **googleapis** – Sheets API
- **bcryptjs** – password hashing
- **iron-session** – auth
- **SWR** – data fetching
- **date-fns** – date handling
- **xlsx** – Excel import

---

## 8. Sheet Setup Notes

- Share your Google Sheet with `olreadycrm@olready-crm.iam.gserviceaccount.com` (Editor).
- If the Sheet has different tab names or column layouts, the setup (first login) will create missing tabs.
- Leads tab: 24 columns (see table above). Existing Sheets with fewer columns will get new ones on next append.

---

## 9. Validation Checklist

- [ ] Login works, session persists
- [ ] Admin can create users (Admin, Team Leader, BDM)
- [ ] BDM sees only own leads; TL sees team leads; Admin sees all
- [ ] Lead CRUD, multi-stage filters, last_modified shown
- [ ] Untouched→Contacted when details + next_follow_up
- [ ] next_follow_up creates task
- [ ] Payment Pending lists Confirmed + part-paid
- [ ] Record Payment updates lead, auto PAID when full
- [ ] Payment fields on Lead page are read-only
- [ ] Pipeline Kanban drag works
- [ ] Dashboard KPIs, BDM targets
- [ ] Calendar shows follow-ups, tasks
- [ ] Reports downloadable (Admin)
- [ ] Import supports Excel column mapping

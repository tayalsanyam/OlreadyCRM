# Olready CRM – Final Plan

Complete specification incorporating execution plan, Twenty/Frappe learnings, and all requirements.

---

## 1. Architecture

| Component | Choice | Notes |
|-----------|--------|-------|
| **Primary DB** | Supabase (PostgreSQL) | Scalable, reusable for future projects |
| **Backup / Support** | Google Sheets | One-way sync Supabase → Sheets; support can view tables |
| **Future** | n8n/Zapier webhooks | For AI, invoice creation, notifications |

---

## 2. Pipeline Stages

```
UNTOUCHED → CONTACTED → FOLLOW UP/DETAILS SHARED → CONFIRMED → PAID | DENIED
```

- **Part paid** = derived state (status stays CONFIRMED, `if_part` true, balance > 0)
- **→ DENIED**: Optional prompt for "Lost reason" → store in `remarks` or `lost_reason` field
- **→ PAID**: Only via Record Payment (Payment Pending tab). Webhook for invoice/customer creation **optional, to add later**

---

## 3. Leads

### Fields
| Field | Required | Notes |
|-------|----------|-------|
| id, name, city, company | Yes | |
| email, phone, insta_id | **Optional** | Phone: duplicate check on create/update |
| bdm, plan, status, source | Yes | |
| remarks, connected_on, next_follow_up, committed_date | Yes on edit | Status, Remarks, Next connect mandatory |
| original_price, discount | No (for CONFIRMED) | Selling price = original_price - discount |
| amount_paid, amount_balance, payment_status, payment_mode, if_part | Auto | |
| created_at, last_modified | Auto | |
| lost_reason | Optional | When status → DENIED |

### Duplicate Check
- On create/update: **phone** must be unique (if provided)
- Warn if email or phone already exists for another lead

### Import Leads
- **Option**: Import leads from CSV/Excel (Leads tab or Admin)
- **Mapping**: Map columns → name, city, company, phone, email, insta_id, bdm, plan, source, etc.
- **Duplicate handling**: Skip / Update / Warn on duplicate phone
- **Validation**: Required fields check before import

### Expected Revenue
- **If** (original_price - discount) entered → use selling price
- **Else** → use plan price

---

## 4. Leads Page (Detail View)

- **Header**: Name, Status (inline editable), BDM, Plan
- **Contact**: City, Company, Phone (optional), Email (optional), Insta ID (optional)
- **Pipeline**: Next Follow Up, Committed Date, Remarks
- **Pricing**: Original Price, Discount → auto **Selling Price**; Amount Paid, Balance (read-only)
- **Activity**: Timeline of actions (call, note, status change) with IST
- **Tasks**: Inline task list, Add Task, mark done
- **Last edited**: Show `last_modified` (IST)

---

## 5. Payment Flow

| Where | What |
|-------|------|
| **Lead page** | Payment info read-only; "Record in Payment Pending" note |
| **Payment Pending tab** | Single tab: CONFIRMED (not paid) + Part paid leads; **Record Payment** action; **highlight post-due** (committed_date before today) |
| **Record Payment** | Modal: amount, mode (CASH, BANK, UPI, CREDIT_CARD, PAYMENT_LINK); Full/Part auto-derived; **balance auto-calculated** |
| **→ PAID** | When full payment; optional webhook for invoice/customer (later) |

### Payment Pending Tab (Detail)
- **Rows**: Lead name, BDM, Plan, Selling price, Amount paid, **Balance** (auto = selling price − amount paid), Committed date, Status (Full due / Part paid)
- **Overdue highlight**: Row styling (e.g. red/amber) when `committed_date` before today
- **Record Payment**: Amount + **Mode** (CASH, BANK, UPI, CREDIT_CARD, PAYMENT_LINK); balance recalculated on save

### Record Payment Clarification
- **Full vs Part**: Auto-determined – if amount = balance → Full; else → Part
- **Balance**: Always auto-calculated (Selling price − Amount paid)
- **Mode**: CASH, BANK, UPI, CREDIT_CARD, PAYMENT_LINK

---

## 6. Auto Transitions

| Trigger | Change |
|---------|--------|
| Lead has core details + `next_follow_up` set | UNTOUCHED → CONTACTED |
| Full payment recorded | CONFIRMED → PAID |
| Partial payment recorded | status stays CONFIRMED; if_part = true |
| `next_follow_up` set/updated | Auto-create task: "Follow up: [Lead name]", due = next_follow_up, assignee = BDM; task linked to lead |

---

## 7. Stage Change → DENIED

- When user sets status = DENIED → **Optional** prompt: "Lost reason?"
- Store in `remarks` or new `lost_reason` field
- Log to Activity: "Status changed to DENIED by [user]" + reason

---

## 8. Dashboard (Well Organised)

| Section | Content | Role-based |
|---------|---------|------------|
| **Target & Revenue** | See below | Admin: totals; TL: team; BDM: own |
| **Executive summary** | Revenue, expected revenue, conversion | All |
| **Pipeline by stage** | Count + value per stage | All |
| **Deals in final stage** | CONFIRMED leads with committed_date | All |
| **Payment overdue** | Pending payments past `committed_date`; count + list; link to Payment Pending | All |
| **Follow-up tasks** | Dedicated task list from `next_follow_up` dates; Overdue → Today → Upcoming; Lead, BDM, Date; link to lead | Admin: all BDMs; TL: team; BDM: own |
| **Today's action** | Follow-ups today, tasks due today | User-specific |
| **Pending tasks** | General tasks (non-follow-up): overdue + due soon | User-specific |

### Target & Revenue (Monthly)

**Per BDM** (default: current month; month selector):
| Metric | Source |
|-------|--------|
| **Target** | Monthly target (from BDMs config) |
| **Expected** | Sum of selling price for leads in CONFIRMED (plugged in when lead → CONFIRMED) |
| **Paid** | Revenue received (amount_paid from PAID + part-paid leads) |
| **Balance to achieve** | Target − Paid |
| **% Achievement** | (Paid / Target) × 100 |

**Admin view only** – Total row:
| Metric | Source |
|-------|--------|
| **Total Target** | Sum of all BDM targets for the month |
| **Total Expected** | Sum of expected from all CONFIRMED leads |
| **Total Paid** | Sum of paid revenue across all BDMs |
| **Total Pending** | Total Target − Total Paid (balance to achieve) |

---

## 9. Filters (All Tabs)

### Global: Custom Period
- **Date presets**: Month to Date, Previous Month, Week to Date, Previous Week
- **Custom period**: Start date + End date (date picker)
- **Scope**: Applies across Leads, Reports, Calendar, Payment Pending, BDM Log, Activity, Tasks

### Per-Tab Filters (Multiple, Combinable)

| Tab | Filters |
|-----|---------|
| **Leads** | Custom period, Stage (multi-select), BDM, Plan, Source |
| **Pipeline** | Custom period, BDM, Plan |
| **Payment Pending** | Custom period, BDM, Plan, Overdue (show only past-due) |
| **Tasks** | Custom period, BDM, Status (Pending/Done), Overdue |
| **Calendar** | Custom period, BDM |
| **Reports** | Custom period, BDM, Plan |
| **BDM Log** | Custom period, BDM |
| **Activity Log** | Custom period, BDM, Type (Call/Note/Status change) |
| **Communications** | Stage, BDM, Plan (future) |

- Filters are **additive** (AND logic)
- Clear-all and save filter presets (optional)

---

## 10. Calendar Tab

- **Absolute calendar** – Month, week, day
- **Events**:
  - **Follow-up tasks** – BDM follow-ups by `next_follow_up` date
  - **Expected revenue** – CONFIRMED leads by `committed_date` (amount due)
  - **Revenue received** – Payments by date (amount paid)
  - **Plans sold** – Date of PAID conversion
- **BDM filter**:
  - **Admin**: All BDMs (can toggle/view any BDM or all)
  - **Team Leader**: Team BDMs only
  - **BDM**: Own follow-ups and revenue only
- **Summary by day** (optional): Expected vs received for selected date range

---

## 11. Reports

- Pipeline by stage
- Revenue vs expected
- Conversion rate
- Activity summary
- Lead list, Payment report, Follow-up report
- **BDM Performance**: BDM | Target | Expected | Paid | Balance to achieve | % Achievement | Month
- **Export**: Admin only (CSV/Excel)

---

## 12. Admin Config

| Item | Editable By | Purpose |
|------|-------------|---------|
| Plans & pricing | Admin | Add/Edit/Delete plans |
| BDMs & targets | Admin | Add/Edit BDMs, set monthly target |
| Users | Admin | Create users, assign role, assigned_bdm |
| Team Leaders | Admin | Assign BDMs to TL |

---

## 13. User Roles

| Role | Leads | Config | Export | Create Users |
|------|-------|--------|--------|--------------|
| Admin | All | ✓ | ✓ | ✓ |
| Team Leader | Team only | ✗ | ✗ | ✗ |
| BDM | Own only | ✗ | ✗ | ✗ |

---

## 14. BDM Log

- Per BDM: date, total_calls, connected_calls, non_answered_calls, talk_time
- Separate tab or filter per BDM

---

## 15. Activity Log

- **Tab**: All interactions, IST timestamps
- **Downloadable** (Admin)
- **Lead page**: Last activity + full list
- **On edit**: Mandatory status, remarks, next connect or stage change

---

## 16. Tasks

- Pending / Done
- Due date, overdue highlight
- Link to lead
- **Auto-create on `next_follow_up`**: When BDM sets/updates next_follow_up on a lead → create task "Follow up: [Lead name]", due = next_follow_up, assignee = BDM
- **Follow-up tasks**: These appear in Tasks tab and in **Dashboard "Follow-up tasks"** section (separate view)

---

## 17. Communications Tab (Future Integration)

**Purpose**: Placeholder tab for future messaging/emailing leads by stage.

- **Location**: New nav item "Communications" or "Campaigns"
- **Planned**: Select stage(s) → compose message/email → send to leads in that stage (or via BDM/Plan filter)
- **Future integrations**: WhatsApp, Email (SMTP/SendGrid), SMS; template support
- **Further integration**: n8n workflows, automated drip campaigns, stage-triggered messages

---

## 18. Integrations & Hosting

### n8n Integration
- **Webhooks**: CRM exposes webhook endpoints for n8n to trigger (e.g. on PAID, on stage change)
- **REST API**: n8n nodes can call CRM API (leads by stage, create task, log activity)
- **Trigger → Action**: e.g. Lead → CONFIRMED → n8n sends reminder; PAID → create invoice
- **Hosting**: CRM backend on a **dedicated domain** (e.g. `api.olready.com` or `crm.olready.com`) so n8n can reliably call webhooks/API

### Backend Domain
- **Hosting**: Deploy Next.js API routes on a stable backend domain
- **Purpose**: n8n, Zapier, external services need a fixed URL for webhooks
- **Env**: `NEXT_PUBLIC_API_URL` or `WEBHOOK_BASE_URL` for callback URLs

### Other Integrations (Later)
- **Webhook on PAID** → Invoice/customer creation (Stripe, QuickBooks, Xero)
- **Daily digest email** – Tasks due, follow-ups (Twenty-style workflow)

---

## 19. Google Sheets Sync (Backup)

- **One-way**: Supabase → Sheets
- **Tabs**: Leads, Users, Activity, Tasks, BDM_Log, BDMs, Plans, Teams
- Support can view same structure

---

## 20. Build Order

1. **Phase 1**: Supabase schema, Auth, Users, Config, Teams, Admin UI
2. **Phase 2**: Leads CRUD, duplicate phone check, optional email/insta_id, multi-stage filters
3. **Phase 3**: Pipeline Kanban, Payment Pending, Record Payment
4. **Phase 4**: Tasks, auto-create on next_follow_up
5. **Phase 5**: Dashboard (organised), Calendar, Reports
6. **Phase 6**: BDM Log, Activity Log, Import/Export
7. **Phase 7**: DENIED lost_reason, Sheets sync, refine UI
8. **Phase 8** (later): Webhook on PAID, daily digest, Communications tab (placeholder)
9. **Phase 9** (later): n8n integration, backend domain, messaging/email by stage

---

## 21. UI Reference

- Borrow patterns from **Twenty** (Kanban, record page layout, tasks)
- Borrow from **Frappe** (all-in-one lead page, Activity tab, tasks inline)
- Dark theme, clean cards, responsive

---

## 22. Validation Checklist

- [ ] Login, session persists
- [ ] Admin: Plans, BDMs, users, teams
- [ ] Leads: duplicate phone check, optional email/insta_id
- [ ] UNTOUCHED→CONTACTED when details + next_follow_up
- [ ] next_follow_up creates task for BDM; Follow-up tasks view on Dashboard
- [ ] Payment Pending: Record Payment, auto PAID, overdue highlight, balance auto-calc
- [ ] Dashboard: Payment overdue section
- [ ] DENIED: optional lost reason
- [ ] Dashboard: Target, Expected, Paid, Balance to achieve, % Achievement; Admin totals; monthly view
- [ ] Calendar: events, BDM filter
- [ ] Export: Admin only
- [ ] Import leads: CSV/Excel, mapping, duplicate handling
- [ ] Custom period + multiple filters on all tabs
- [ ] Sheets sync (backup)
- [ ] Communications tab placeholder; n8n/webhook-ready; backend domain

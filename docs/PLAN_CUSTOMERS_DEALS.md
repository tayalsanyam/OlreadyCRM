# Plan: Customers on Plan & Subscriptions

**Status:** Approved – ready for implementation  
**Trigger:** Full payment received in Payment Pending  
**Scope:** New tables, pages, flows; extends existing leads, payments, tasks

**Decisions:** Start fresh (no backfill); Tasks assignee = BDM; Use **subscriptions** table (not deals).

---

## 1. Current State (What We Have)

| Component | Current |
|-----------|---------|
| **Leads** | UNTOUCHED → … → CONFIRMED → PARTLY_PAID → PAID \| DENIED |
| **Payment Pending** | CONFIRMED + PARTLY_PAID with balance > 0 |
| **Record Payment** | Updates lead: amount_paid, balance, status→PAID when full |
| **subscriptions** | Table exists (plan_name, dates, leads_count, price_paid) – not in migrations |
| **Config** | BDMs, Plans, Teams in Admin |

**Gap:** No structured capture of plan details (leads, months, add-ons) at full payment. No Customers page. No subscription pipeline for renewals/upgrades. No Ops Coordinator config.

---

## 2. Trigger Point: Full Payment in Payment Pending

**When:** User records payment and balance → 0 (full payment).

**Current flow:** `recordPayment()` → lead status = PAID, payment_status = COMPLETE.

**New flow:** Before/after PAID transition, prompt for **Subscriber Plan Details**:
- **(i) Leads** – number of leads in plan
- **(ii) Months** – plan duration
- **(iii) Add Ons** – text (e.g. "Confirmed Booking", "Extra support")
- **Plan start date** – default today
- **Plan expiry date** – computed: start_date + months (or explicit if needed)
- **Ops Coordinator** – select from Admin-managed list

Then:
1. Create **Customer** record (linked to lead)
2. Create first **Subscription** record (initial plan activation)

---

## 3. New Tables & Schema

### 3.1 ops_coordinators (Admin config, like bdms)

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL | PK |
| name | TEXT | UNIQUE NOT NULL |
| created_at | TIMESTAMPTZ | |

**Admin:** Add/remove Ops Coordinators (same UX as BDMs).

---

### 3.2 customers (one per lead when first PAID)

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PK (e.g. C{timestamp}) |
| lead_id | TEXT | FK leads(id) UNIQUE – one customer per lead |
| name | TEXT | From lead |
| city | TEXT | From lead |
| phone | TEXT | From lead |
| email | TEXT | From lead |
| ops_coordinator | TEXT | FK ops_coordinators.name |
| created_at | TIMESTAMPTZ | |

Contact, city, ops_coordinator are denormalized from lead at creation. Plan-specific data lives on **subscriptions**.

---

### 3.3 subscriptions (existing table – extend with new columns)

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PK |
| lead_id | TEXT | FK leads(id) |
| bdm | TEXT | BDM who closed (NEW) |
| subscription_type | TEXT | 'initial' \| 'renewal' \| 'upgrade' (NEW) |
| plan_name | TEXT | e.g. Prime, Privy |
| plan_start_date | DATE | |
| plan_end_date | DATE | Expiry date |
| leads_count | INTEGER | Subscriber plan: leads |
| duration_months | INTEGER | Subscriber plan: months |
| price_paid | NUMERIC | |
| add_ons | TEXT | e.g. "Confirmed Booking" |
| business_generated | TEXT | Comment box 1 (NEW) |
| overall_experience | TEXT | Comment box 2 (NEW) |
| created_at | TIMESTAMPTZ | |
| active | BOOLEAN | |

**One subscription per plan activation** (first sale, renewal, or upgrade).

**Migration:** Add bdm, subscription_type, business_generated, overall_experience to subscriptions if not present.

---

## 4. Pages & UI

### 4.1 Customers on Plan (`/customers`)

- **List:** All customers (leads with at least one subscription)
- **Columns:** Name, City, Contact, Plan (from latest subscription), Plan date, Amount, Expiry date, Ops Coordinator
- **Filters:** Ops Coordinator, City, Expiry (e.g. expiring soon)
- **Row click:** Customer detail (or link to lead + subscriptions)

### 4.2 Payment Pending – Full Payment Flow (enhanced)

When recording payment that closes the balance:
1. Show **Subscriber Plan Details** step/modal:
   - Leads count, Months, Add Ons
   - Plan start date (default today)
   - Ops Coordinator (dropdown)
2. On confirm: `recordPayment()` → create Customer + first Subscription

### 4.3 Lead Detail – Subscriptions Section (new)

For leads with `status = PAID` and at least one subscription:
- **Subscriptions pipeline** section:
  - Table/list: Type, BDM, Duration, Payment, Start, Expiry, Business generated, Overall experience
  - Add Subscription (renewal/upgrade) – new form
- **Tasks:**
  - Mid-way follow-up (e.g. plan_months/2 after start)
  - Re-sales task: 10 days before expiry

### 4.4 Admin – Ops Coordinators

- New config section (like BDMs): Add/remove Ops Coordinators
- Stored in `ops_coordinators` table

---

## 5. Tasks (Auto-created)

| Trigger | Task | Assignee |
|---------|------|----------|
| Subscription created (initial) | "Mid-way follow-up: [Customer name]" – due = plan_start_date + (plan_months/2) months | BDM |
| Subscription created (initial) | "Re-sales: [Customer name]" – due = plan_end_date − 10 days | BDM |
| Subscription created (renewal/upgrade) | Same pattern for new subscription | BDM |

*Ops module for assignee logic later.*

---

## 6. Data Flow Summary

```
Lead (CONFIRMED/PARTLY_PAID) 
    → Payment Pending 
    → Record full payment 
    → [NEW] Subscriber details modal (leads, months, add-ons, ops coordinator)
    → Lead status = PAID
    → Create Customer (if not exists)
    → Create Subscription (type=initial)
    → Create tasks (mid-way, re-sales) – assignee = BDM

Lead (PAID, has subscriptions)
    → Lead detail shows Subscriptions section
    → Add Subscription (renewal/upgrade) → new Subscription row + tasks
```

**Backfill:** Start fresh. User will backfill with starting date later.

---

## 7. Migration Order

1. `007_ops_coordinators.sql` – create table
2. `008_customers.sql` – create customers table
3. `009_subscriptions_extend.sql` – ensure subscriptions exists, add bdm, subscription_type, business_generated, overall_experience

---

## 8. API Endpoints (New)

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/customers | List customers (with latest subscription) |
| GET | /api/customers/[id] | Customer detail + subscriptions |
| GET | /api/subscriptions?lead_id=X | Subscriptions for a lead |
| POST | /api/subscriptions | Create subscription (renewal/upgrade) |
| Ops coordinators | Under /api/config | Add to dropdowns, Admin CRUD |

---

## 9. Config Changes

- **Dropdowns:** Add `ops_coordinators` to `/api/config/dropdowns`
- **Admin Config:** New "Ops Coordinators" section (like BDMs)

---

## 10. Implementation Phases (Suggested)

| Phase | Scope |
|-------|-------|
| **A** | Ops Coordinators config, migrations |
| **B** | customers + subscriptions (extend), Record Payment flow with subscriber modal |
| **C** | Customers on Plan page |
| **D** | Lead detail – Subscriptions section, Add Subscription (renewal/upgrade) |
| **E** | Auto-tasks (mid-way, re-sales) – assignee BDM |
| **F** | Dashboard/Reports updates (e.g. expiring soon) |

---

*Plan approved. Ready for implementation.*

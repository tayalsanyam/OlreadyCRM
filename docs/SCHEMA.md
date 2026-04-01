# Olready CRM – Supabase Schema

Reference for tables, columns, and structure. Source: `supabase/migrations/`.

**Live schema:** Run `cd crm && node scripts/describe-schema.js` to fetch current tables, columns, and row counts from Supabase.

**Full export:** Run `cd crm && node scripts/export-supabase-dump.js` to export all tables to `crm/supabase-dump/`. Share that folder for schema/data review.

---

## Tables Overview

| Table | Purpose |
|-------|---------|
| users | Custom auth (not Supabase Auth); roles: admin, team_leader, bdm |
| bdms | BDM names + monthly targets |
| plans | Plan names + prices |
| teams | Team assignments (team_id, team_name, bdm); multi-BDM per team |
| leads | Core CRM entity; **payment fields** (amount_paid, amount_balance, payment_status, payment_mode, if_part) |
| activity | Lead activity timeline (calls, notes, status changes) |
| tasks | Tasks with optional lead link |
| bdm_log | BDM call metrics (total, connected, non-answered, talk time) |
| subscriptions | Plan subscriptions per lead (plan_name, dates, leads_count, price_paid); *not in migrations* |

---

## 1. users

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PK |
| username | TEXT | UNIQUE NOT NULL |
| password_hash | TEXT | NOT NULL |
| role | TEXT | CHECK: admin, team_leader, bdm |
| assigned_bdm | TEXT | For BDM users |
| team_id | TEXT | For TL/BDM |
| email | TEXT | Optional; for digest |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

---

## 2. bdms

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL | PK |
| bdm | TEXT | UNIQUE NOT NULL |
| target | NUMERIC | DEFAULT 0 (monthly) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

---

## 3. plans

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL | PK |
| plan | TEXT | UNIQUE NOT NULL |
| price | NUMERIC | NOT NULL DEFAULT 0 |
| active | BOOLEAN | DEFAULT true (migration 004) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

---

## 4. teams

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL | PK |
| team_id | TEXT | UNIQUE with bdm (idx_teams_team_id_bdm) |
| team_name | TEXT | NOT NULL |
| bdm | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

One row per BDM in team; multiple BDMs can share same team_id.

---

## 5. leads

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PK |
| name | TEXT | NOT NULL |
| city | TEXT | NOT NULL |
| company | TEXT | |
| email | TEXT | |
| phone | TEXT | Unique if provided (idx_leads_phone) |
| insta_id | TEXT | |
| bdm | TEXT | NOT NULL |
| plan | TEXT | NOT NULL |
| status | TEXT | DEFAULT 'UNTOUCHED' |
| source | TEXT | |
| remarks | TEXT | |
| connected_on | DATE | |
| next_follow_up | DATE | |
| committed_date | DATE | |
| original_price | NUMERIC | |
| discount | NUMERIC | DEFAULT 0 |
| amount_paid | NUMERIC | DEFAULT 0 |
| amount_balance | NUMERIC | DEFAULT 0 |
| payment_status | TEXT | DEFAULT 'PENDING' |
| payment_mode | TEXT | |
| if_part | BOOLEAN | DEFAULT FALSE |
| lost_reason | TEXT | When status = DENIED |
| active | BOOLEAN | DEFAULT true (migration 006); inactive leads hidden by default |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| last_modified | TIMESTAMPTZ | DEFAULT NOW(); trigger updates |

**Status flow:** UNTOUCHED → CONTACTED → FOLLOW UP/DETAILS SHARED → CONFIRMED → PARTLY_PAID → PAID | DENIED

---

## 6. activity

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PK |
| lead_id | TEXT | FK leads(id) ON DELETE CASCADE |
| date | DATE | NOT NULL |
| time | TEXT | |
| action | TEXT | NOT NULL |
| user | TEXT | |
| notes | TEXT | |
| status | TEXT | |
| remarks | TEXT | |
| next_connect | TEXT | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

---

## 7. tasks

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PK |
| title | TEXT | NOT NULL |
| due | DATE | NOT NULL |
| assignee | TEXT | NOT NULL |
| done | BOOLEAN | DEFAULT FALSE |
| lead_id | TEXT | FK leads(id) ON DELETE SET NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

---

## 8. bdm_log

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PK |
| bdm | TEXT | NOT NULL |
| date | DATE | NOT NULL |
| total_calls | INTEGER | DEFAULT 0 |
| connected_calls | INTEGER | DEFAULT 0 |
| non_answered_calls | INTEGER | DEFAULT 0 |
| talk_time | INTEGER | DEFAULT 0 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

---

## 9. subscriptions

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PK |
| lead_id | TEXT | FK to leads |
| plan_name | TEXT | e.g. Prime, Privy |
| plan_start_date | DATE | |
| plan_end_date | DATE | |
| leads_count | INTEGER | |
| duration_months | INTEGER | |
| price_paid | NUMERIC | |
| add_ons | TEXT | e.g. "Confirmed Booking" |
| created_at | TIMESTAMPTZ | |
| active | BOOLEAN | |

*Not in `supabase/migrations/` – added via dashboard or external migration.*

---

## Payment flow (no separate payments table)

- **Payment Pending** = filtered `leads` (status CONFIRMED, balance > 0)
- **Record Payment** = updates `leads` (amount_paid, amount_balance, payment_status, payment_mode, if_part)
- **subscriptions** = separate table for plan subscriptions (Prime, Privy, etc.)

---

## Migrations Order

1. `001_initial_schema.sql` – All tables, RLS, policies, leads trigger
2. `002_add_user_email.sql` – users.email
3. `003_teams_multi_bdm.sql` – teams unique (team_id, bdm)
4. `004_plans_active.sql` – plans.active

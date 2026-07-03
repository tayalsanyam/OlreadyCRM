# Olready Backend — Implementation Plan (32 Changes)

> **Source:** `Olready_Backend_CursorPrompts.docx` (May 2025)  
> **Schema backup:** `db/backups/DATABASE_SCHEMA_BACKUP_2026-05-23.md`  
> **Status:** Implemented (May 2026) — migrations 015/016 applied; see notes below for partial items  
> **Principle:** Don't break, improve, build, enhance.

This document maps every change from the Cursor prompts file to **actual repo paths**, notes **corrections** where the doc disagrees with the codebase, and defines **dependencies** so work can be done safely in order.

---

## Critical codebase facts (read before any change)

| Doc assumption | Actual codebase |
|----------------|-----------------|
| `rm.users` | **`rm.staff`** — UI may say "Users" (`/admin/users`, `/api/admin/users`) |
| `rm.leads` | **`rm.bride_leads`** |
| `rm.tasks` | **`rm.rm_tasks`** |
| `GET /api/commission/leads` | **Does not exist** — commission queue uses **`GET /api/leads/queue?status=commission_rm`** |
| `PATCH /api/admin/muas/[id]/plan` | **`PATCH /api/admin/muas/[id]`** (and **`PATCH /api/admin/muas/bulk-plan`**) |
| `status = 'commissionRm'` in SQL | **`commission_rm`** (use `toDbStatus()` / `lib/db-mappers.ts`) |
| `app/(app)/admin/settings/page.tsx` | **Does not exist** — use **`/admin/config`** or create **`/admin/settings`** |
| Commission MUA roster | **`/commission/muas`** uses a **table page**, not **`MuaRosterView`** (only on **`/rm/muas`**) |

**SQL in app code:** Tables are unqualified (`bride_leads`, `staff`) because `db/index.ts` sets `search_path=rm`.

**Already partially implemented (recent work):**

- Fast commission/RM queue (`lib/leads-queue-query.ts`, migration `014`)
- Commission MUA list pagination (`lib/commission-muas-query.ts`)
- Bulk MUA plan update (`/api/admin/muas/bulk-plan`)
- `commission_offered` / `commission_agreed` on `bride_leads` (migration `012`)
- Multi-booking logic in `lib/booking.ts` (`reconcileLeadBookingStatus` — lead stays active until all ceremonies booked)

---

## Recommended implementation order

### Phase A — Database migrations (single migration file `015_cursor_prompts_batch.sql`)

Run **before** dependent features. Suggested contents:

```sql
-- 015_cursor_prompts_batch.sql (draft — apply after review)

-- #04 budget tier ranges
ALTER TABLE rm.sla_config
  ADD COLUMN IF NOT EXISTS budget_tier_ranges JSONB DEFAULT '{}'::jsonb;

-- #27 lead sources
ALTER TABLE rm.sla_config
  ADD COLUMN IF NOT EXISTS lead_sources JSONB DEFAULT '[]'::jsonb;

-- #05 event description
ALTER TABLE rm.lead_events
  ADD COLUMN IF NOT EXISTS description TEXT;

-- #25 city regions
CREATE TABLE IF NOT EXISTS rm.city_regions (
  id SERIAL PRIMARY KEY,
  city TEXT NOT NULL UNIQUE,
  region rm.region NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- #22 cancelled bookings
ALTER TABLE rm.bookings
  ADD COLUMN IF NOT EXISTS cancelled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- #26 staff multiple regions
ALTER TABLE rm.staff
  ADD COLUMN IF NOT EXISTS regions rm.region[] DEFAULT '{}';
UPDATE rm.staff SET regions = ARRAY[region] WHERE region IS NOT NULL AND cardinality(regions) = 0;

-- #31 expired leads
ALTER TYPE rm.lead_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TABLE rm.bride_leads
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

-- #33 feedback + prospects
CREATE TABLE IF NOT EXISTS rm.lead_feedback ( ... );
CREATE TABLE IF NOT EXISTS rm.mua_prospects ( ... );

-- #24 task type (if using enum — prefer extending rm.task_type enum)
ALTER TYPE rm.task_type ADD VALUE IF NOT EXISTS 'collect_mua_prospect';
```

**Also required (not in one batch):**

- Recreate **`rm.leads_full`** after `expired` enum + new `bride_leads` columns (same pattern as `013_recreate_leads_full_commission.sql`)
- Update **`rm.compute_urgency_band`** or view logic for **#06** (urgency from `max(lead_events.event_date)` — see change #06)

Seed **`city_regions`** in migration or a seed script (80 cities from doc #25).

---

### Phase B — Shared APIs & config (blocks many UI changes)

| Priority | Changes |
|----------|---------|
| 1 | **#25** `GET /api/cities`, admin CRUD `/api/admin/cities` |
| 2 | **#04, #27** extend `GET/PATCH /api/admin/config` + `GET /api/upload/config` |
| 3 | **#01, #07, #10, #30, #31** admin leads list/assigned/reassign/NI/expired APIs |
| 4 | **#12, #17, #30** admin reports + bookings by-MUA |

### Phase C — Forms & validation

| Priority | Changes |
|----------|---------|
| 1 | **#02, #03** phone/email validation |
| 2 | **#08** city datalist (depends #25) |
| 3 | **#04, #05, #06, #27** lead create/verify + ceremonies |
| 4 | **#01** assign page extensions |

### Phase D — RM / Commission UX

| Priority | Changes |
|----------|---------|
| 1 | **#09, #11** queue filters & NI behaviour |
| 2 | **#15, #16, #21, #22** booking flow |
| 3 | **#18–#20, #32** MUA push/roster |
| 4 | **#23, #24** tasks |
| 5 | **#28, #29** reports |

### Phase E — Admin pages & cron

| Priority | Changes |
|----------|---------|
| 1 | **#07, #10, #31** new admin pages + sidebar |
| 2 | **#25** city manager UI (config or new settings page) |
| 3 | **#33** feedback + prospects |
| 4 | **#31** `GET /api/cron/expire-leads` |

---

## Change-by-change specification

### #01 — Re-assign leads

| | |
|---|---|
| **Scope** | Admin |
| **Type** | Feature |
| **Doc files** | `app/(app)/admin/assign/page.tsx`, `app/api/admin/assign/route.ts`, `app/api/admin/leads/unassigned/route.ts` |
| **Actual today** | Assign page = **single table**, no tabs. APIs: `GET unassigned`, `GET /api/admin/rms`, `POST /api/admin/assign` only. |

**Implement:**

1. **`GET /api/admin/leads/assigned`** — new file `app/api/admin/leads/assigned/route.ts`  
   - Filter: `status IN ('assigned','commission_rm','booked')` (DB snake_case)  
   - Columns: id, displayId, brideName, region, budgetTier, status, assignedRmId, assignedRmName, assignmentDate, lastActivityAt (from comms max or `leads_full.last_activity_at`)  
   - Support `?format=csv` for #07  

2. **`POST /api/admin/leads/reassign`** — new file `app/api/admin/leads/reassign/route.ts`  
   - Body: `{ leadId, target: 'rm' | 'commission' | 'portal', rmId?: string }`  
   - `rm`: set `assigned_rm_id`, `status = 'assigned'`, `assignment_date = CURRENT_DATE`  
   - `commission`: `status = 'commission_rm'`, clear `assigned_rm_id`  
   - `portal`: `portal_only = true`, clear `assigned_rm_id` (confirm product intent for status)  
   - Log comm (`entry_type` appropriate — doc says `'assigned'`; consider `shifted_commission` for commission path)  
   - Use `withTransaction` + `insertAuditLog`  

3. **`app/(app)/admin/assign/page.tsx`**  
   - Tab: **Unassigned** (existing)  
   - Tab: **Assigned Leads** — table + per-row targets (RM by region, Commission, Portal)  
   - Extend unassigned bulk/single assign dropdowns with Commission + Portal  
   - **Do not remove** existing `POST /api/admin/assign` behaviour  

**Note:** #07 asks for a **separate** assigned-leads page; #01 also adds a tab — implement API once, use in both places or pick one UX (doc has both; prefer standalone page + keep assign page focused on unassigned + link).

---

### #02 — Phone validation (10 digits)

| | |
|---|---|
| **Files** | `components/leads/AddLeadModal.tsx`, `components/upload/VerifyLeadSlideOver.tsx` |

**Implement:** On blur: strip non-digits, require `length === 10` if non-empty; required field blocks submit. Error: `Phone must be exactly 10 digits`. Keep `type="text"`.

**Also check:** Any other phone inputs (MUA whatsapp, prospect phone in #33) — apply same helper in `lib/validation.ts` if reused.

---

### #03 — Email validation

| | |
|---|---|
| **Files** | Same as #02 |

**Implement:** Optional field; on blur if non-empty: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Error: `Enter a valid email address`. Do not block empty.

---

### #04 — Budget tier range labels

| | |
|---|---|
| **Files** | `lib/types.ts`, `AddLeadModal.tsx`, `VerifyLeadSlideOver.tsx`, `app/(app)/admin/config/page.tsx`, `app/api/admin/config/route.ts` |

**Implement:**

1. `BUDGET_TIER_RANGES` constant in `lib/types.ts` (defaults as in doc)  
2. Migration: `sla_config.budget_tier_ranges JSONB`  
3. `GET/PATCH` config group `budgetTierRanges`  
4. Modals load config on open; tier select shows label + range  
5. Admin config UI: four editable inputs  

---

### #05 — Event description box

| | |
|---|---|
| **Files** | `CeremonyBudgetFields.tsx`, `lib/types.ts`, `app/api/admin/leads/create/route.ts`, `app/api/upload/leads/create/route.ts`, `LeadProfileClient.tsx` |

**Implement:**

1. `LeadEvent.description` in types; DB `lead_events.description`  
2. `CeremonyEntry.description` + optional Input in `CeremonyBudgetFields`  
3. Persist on create/verify routes  
4. Profile: grey subtitle under ceremony label  

---

### #06 — Multiple event dates + multiple MUAs per lead

| | |
|---|---|
| **Files** | `CeremonyBudgetFields.tsx`, `AddLeadModal.tsx`, create APIs, `LeadProfileClient.tsx`, SQL view/function |

**Current:** `reconcileLeadBookingStatus` already avoids full `booked` until all events booked. Ceremonies only have name/budget; single lead `eventDate`.

**Implement:**

1. Per-ceremony `date` in `CeremonyBudgetFields` + types  
2. Remove top-level event date from modal; `eventDate = min(ceremony dates)` for `bride_leads.event_date`  
3. Insert `lead_events.event_date` per row  
4. Profile: per-event date + booking status line  
5. **Urgency / `leads_full`:** Update `compute_urgency_band` input to use `max(lead_events.event_date)` for SLA (migration recreates view). Keep `bride_leads.event_date` as earliest for sort/display per doc  

**Risk:** Heavy `leads_full` view — queue already uses fast path; only touch view if reports still use `leads_full`.

---

### #07 — Assigned leads view (admin)

| | |
|---|---|
| **Files** | `app/(app)/admin/assigned-leads/page.tsx` (new), `Sidebar.tsx` |

**Depends on:** #01 `GET /api/admin/leads/assigned`

**Implement:** Standalone page with filters (rmId, status, region), table columns per doc, CSV export, expandable last 5 comms via `GET /api/leads/[id]/comms`. Sidebar: **Assigned Leads** (`FileText`).

---

### #08 — City dropdown + auto-region from event city

| | |
|---|---|
| **Files** | `AddLeadModal.tsx`, `VerifyLeadSlideOver.tsx`, `components/admin/AddMuaModal.tsx` |

**Depends on:** #25 `GET /api/cities`

**Implement:** `<datalist>` from API; match city → set region read-only. **Leads:** wire to **event location** city, not bride home city. Unknown city → region stays editable.

---

### #09 — NI leads not disappearing from commission queue (bug)

| | |
|---|---|
| **Doc files** | `RmQueueClient.tsx`, `app/api/commission/leads/route.ts` |

**Actual:** Fix **`app/api/leads/queue/route.ts`** and/or **`lib/leads-queue-query.ts`** (not commission/leads).

**Implement:**

1. Exclude `status IN ('archived','missed','expired')` when status filter is commission  
2. Exclude leads where current commission RM has closed push `outcome = 'not_interested'` (needs session user + push join)  
3. `RmQueueClient`: optimistic remove on NI/archive  
4. Verify NI action sets **`bride_leads.status = 'archived'`** (check `PATCH /api/leads/[id]` or bulk-not-interested)  

---

### #10 — NI leads view (admin + uploader)

| | |
|---|---|
| **Files** | `admin/assign/page.tsx`, `upload/leads/page.tsx` |

**Depends on:** `GET /api/admin/leads?status=archived,missed` (new `app/api/admin/leads/route.ts`)

**Implement:** Third tab on assign **or** link to NI report (#30). Upload page: NI filter pill on loaded/paginated data.

---

### #11 — Filter pills — single-select urgency + stage

| | |
|---|---|
| **Files** | `RmQueueClient.tsx`, `commission/queue/page.tsx` |

**Implement:**

1. Urgency + tier: **single-select** per group (verify current — may be multi-select)  
2. New stage pills: `initial_contact`, `offer_sent`, etc. — client filter on pushes in lead payload (ensure queue API returns enough push stage data, or add lightweight field)  

**Note:** Fast queue may not include per-push stages — extend `lib/leads-queue-query.ts` with aggregated stage flags if needed.

---

### #12 — MUA-wise bookings view

| | |
|---|---|
| **Files** | `app/(app)/admin/bookings/page.tsx`, `BookingsTable.tsx` |

**Implement:** Tab **By MUA**; `GET /api/admin/bookings/by-mua` (new); aggregate revenue; expand row for detail; CSV export.

---

### #13 — Booking revenue on MUA profile

| | |
|---|---|
| **Files** | `lib/types.ts`, `MuaDetailClient.tsx`, `app/api/muas/[id]/route.ts` |

**Implement:** `SUM(booked_price)` in GET profile; display in stats next to booking count.

---

### #14 — Plan changes not reflecting — Highest Privy (bug)

| | |
|---|---|
| **Doc files** | `PlanAssignModal.tsx`, `admin/muas/page.tsx` |

**Actual route:** `PATCH /api/admin/muas/[id]` uses **`toDbTier()` regex** — prefer **`toDbPlanTier()`** from `lib/db-mappers.ts` (handles `highestPrivy` → `highest_privy`).

**Verify:** `PLAN_TIER_LABELS` includes `highestPrivy`; `fromDbPlanTier` on read; bulk-plan already uses `toDbPlanTier`.

---

### #15 — Commission advance booking & payment (bug)

| | |
|---|---|
| **Files** | `BookingModal.tsx`, `app/api/leads/[id]/book/route.ts` |

**Current:** `lib/booking.ts` accepts `advancePaid` / `fullPaid`. **Verify** book route passes body into `confirmBooking`. Role: `canAccessLead` includes commission RM.

**Action:** Trace `POST /api/leads/[id]/book` — fix if destructuring omits fields; no separate commission book route needed.

---

### #16 — Event names in commission RM view (bug)

| | |
|---|---|
| **Files** | `CommissionFollowUpPanel.tsx`, `CommissionSplitView.tsx` |

**Implement:** Ensure lead detail API returns `ceremonyType` per event/booking; UI: `Wedding — ₹25,000` in split view bookings block.

---

### #17 — Booking revenue in admin MUA list

| | |
|---|---|
| **Files** | `admin/muas/page.tsx`, `app/api/admin/muas/route.ts` |

**Implement:** Aggregate `bookings` in GET list; `totalBookingRevenue` on `AdminMuaListItem`; Revenue column in table.

---

### #18 — Remove Push to Lead from MUA profile

| | |
|---|---|
| **Files** | `MuaDetailClient.tsx`, `rm/muas/[id]`, `commission/muas/[id]`, `admin/muas/[id]` |

**Current:** RM + commission pass **`showPushToLead={true}`** — doc wants **false** on all three profile pages.

**Implement:** Set `showPushToLead={false}` on rm, commission, admin detail pages. Keep components in tree (prop-guarded).

---

### #19 — Plan expiry in Push MUA slide-over

| | |
|---|---|
| **Files** | `PushMuaSlideOver.tsx`, `app/api/muas/available/route.ts` |

**Implement:** Return `planExpiry`; display expired / expires in Xd / date per rules in doc.

---

### #20 — Filters during Push MUA

| | |
|---|---|
| **Files** | `PushMuaSlideOver.tsx`, `app/api/muas/available/route.ts` |

**Implement:** Return `region`, `planTier`; UI collapsible filters (tier, region pills, city filter, expiry pills). Client-side filter in `useMemo`.

---

### #21 — Remove auto-select in Booking modal (bug)

| | |
|---|---|
| **Files** | `BookingModal.tsx` |

**Implement:** Empty defaults for event/push/price; placeholder options; guard `!eventId || !pushId || !price`; filter out events already booked.

---

### #22 — Cancelled bookings tab

| | |
|---|---|
| **Files** | Admin/RM/commission bookings pages, `BookingsTable.tsx`, `lib/types.ts` |

**Implement:** Migration cancelled columns; tabs Active/Cancelled; `GET /api/bookings?cancelled=true`; `PATCH /api/bookings/[id]/cancel` (doc) — today uses **`DELETE`**; align product: soft cancel vs delete.

**Decision needed:** Replace DELETE with cancel PATCH or keep both.

---

### #23 — Tasks in commission RM

| | |
|---|---|
| **Files** | `rm/tasks/page.tsx`, `TaskCompleteModal.tsx`, `task-utils.ts`, `Sidebar.tsx` |

**Current:** Commission uses **`/rm/tasks`**; sidebar already links tasks for commissionRm.

**Implement:** Verify `taskRequiresPushCompletion` for commission; follow-up date in modal when `pushFlow`; create `/commission/tasks` only if redirect wrapper desired (optional).

---

### #24 — Task stages — booked / close outcomes

| | |
|---|---|
| **Files** | `TaskCompleteModal.tsx`, `lib/types.ts`, `app/api/tasks/[id]/route.ts` |

**Implement:** Radio Following up vs Closing; close outcomes map to push status/outcome; no next task on close. Extend PATCH complete handler (not GET).

---

### #25 — India city list (DB + admin)

| | |
|---|---|
| **Doc files** | `admin/settings/page.tsx`, `app/api/cities/route.ts` |

**Actual:** No settings page — add **`/admin/settings`** or section under **`/admin/config`**.

**Implement:**

- Table `rm.city_regions`  
- `GET /api/cities` (public)  
- `POST /api/admin/cities`, `PATCH/DELETE /api/admin/cities/[city]`  
- Admin UI table + add city + search  
- Sidebar **Settings** if new page  

---

### #26 — RMs multiple regions

| | |
|---|---|
| **Doc files** | `lib/types.ts`, `admin/users/page.tsx`, `app/api/admin/users/*`, `app/api/admin/rms/route.ts`, `admin/assign/page.tsx` |

**Correction:** `staff.regions` **`region[]`**, not `users`.

**Implement:**

1. Migration `staff.regions`  
2. `User.regions` + session payload  
3. Admin users multi-checkbox regions  
4. `GET /api/admin/rms` returns regions  
5. Assign page: `r.regions.includes(lead.region)`  
6. Queue: `lead.region = ANY(user.regions)` for regional RM  

---

### #27 — Source as admin-configurable dropdown

| | |
|---|---|
| **Files** | Lead modals, admin config, `app/api/upload/config/route.ts` |

**Implement:** `sla_config.lead_sources JSONB`; config UI; Select + Other custom text in modals.

---

### #28 — Reports — recent activity on search

| | |
|---|---|
| **Files** | `RoleReportsPage.tsx`, `LeadJourneyReport.tsx`, `MuaLedgerReport.tsx` |

**Implement:** Expandable comms timeline on single-lead filter; MUA search → detail view (plan history, pushes, bookings, comms).

---

### #29 — Custom duration filter for reports

| | |
|---|---|
| **Files** | `DateRangeFilter.tsx`, report components + APIs |

**Implement:** Verify range mode UI; wire `activityFrom/activityTo` on lead journey; use `DateRangeFilter` on revenue/MUA ledger; API `BETWEEN` filters.

---

### #30 — NI leads report

| | |
|---|---|
| **Files** | `admin/reports/page.tsx`, new `NiLeadsReport.tsx`, `app/api/admin/reports/ni-leads/route.ts` |

**Correction:** SQL `bride_leads` + `staff` not `leads`/`users`.

**Implement:** Tab + API + CSV; columns per doc.

---

### #31 — Inactive/expired leads auto-archival

| | |
|---|---|
| **Files** | `lib/types.ts`, `app/api/cron/expire-leads/route.ts` |

**Current cron:** Only **`POST /api/cron/shift-leads`**.

**Implement:**

1. `expired` lead_status + `expired_at`  
2. `GET /api/cron/expire-leads` with `CRON_SECRET`  
3. Exclude expired in queue/assign APIs  
4. Admin page `/admin/leads/expired`  
5. `vercel.json` schedule entry  

**Review SQL:** Doc uses `lead_events.event_date >= NOW()` — confirm business rule (no future events → expired).

---

### #32 — MUA roster plan filter & date filter

| | |
|---|---|
| **Doc files** | `MuaRosterView.tsx`, `app/api/rm/muas`, `app/api/commission/muas` |

**Actual:** Filters are **client-side** on RM roster only. Commission page is **different component**.

**Implement on `MuaRosterView`:** Plan tier pills, pushed from/to, clear filters. **Optional:** Align commission `/commission/muas` UI or switch to shared roster.

---

### #33 — Post-event feedback + MUA prospects

| | |
|---|---|
| **Files** | `LeadProfileClient.tsx`, task APIs, new feedback/prospect routes/pages |

**Corrections:**

- `rm.lead_feedback.lead_id` → **`bride_leads(id)`**  
- `submitted_by` → **`staff(id)`**  
- Tasks table → **`rm_tasks`**, `task_type` enum extension  
- Prospect task assignee: use **`staff_id`** of submitter  

**Implement:** Full flow per doc — migration, types, POST/GET feedback, admin prospects + feedback pages, `FeedbackModal`, `collectMuaProspect` task completion fields.

---

## New files checklist (summary)

| Path | Change(s) |
|------|-----------|
| `app/api/admin/leads/route.ts` | #10 |
| `app/api/admin/leads/assigned/route.ts` | #01, #07 |
| `app/api/admin/leads/reassign/route.ts` | #01 |
| `app/api/cities/route.ts` | #25 |
| `app/api/admin/cities/route.ts` | #25 |
| `app/api/admin/cities/[city]/route.ts` | #25 |
| `app/api/admin/bookings/by-mua/route.ts` | #12 |
| `app/api/admin/reports/ni-leads/route.ts` | #30 |
| `app/api/admin/feedback/route.ts` | #33 |
| `app/api/admin/mua-prospects/route.ts` | #33 |
| `app/api/leads/[id]/feedback/route.ts` | #33 |
| `app/api/cron/expire-leads/route.ts` | #31 |
| `app/api/bookings/[id]/cancel/route.ts` | #22 (if soft cancel) |
| `app/(app)/admin/assigned-leads/page.tsx` | #07 |
| `app/(app)/admin/leads/expired/page.tsx` | #31 |
| `app/(app)/admin/settings/page.tsx` OR config section | #25 |
| `app/(app)/admin/mua-prospects/page.tsx` | #33 |
| `app/(app)/admin/feedback/page.tsx` | #33 |
| `components/admin/reports/NiLeadsReport.tsx` | #30 |
| `components/leads/FeedbackModal.tsx` | #33 |
| `db/migrations/015_cursor_prompts_batch.sql` | Phase A |
| `lib/validation.ts` (optional) | #02, #03 |

---

## Sidebar additions (consolidated)

| Label | href | Icon | Changes |
|-------|------|------|---------|
| Assigned Leads | `/admin/assigned-leads` | FileText | #07 |
| Settings / City mapping | `/admin/settings` or Config | Settings | #25 |
| Expired Leads | `/admin/leads/expired` | Clock | #31 |
| MUA Prospects | `/admin/mua-prospects` | UserPlus | #33 |
| Post-Event Feedback | `/admin/feedback` | MessageSquare | #33 |

---

## Testing checklist (after implementation)

- [ ] `node scripts/smoke-commission-queue.mjs` — queue, portal, muas, health  
- [ ] Admin assign: unassigned + reassign rm/commission/portal  
- [ ] Create lead: multi-ceremony dates, descriptions, city→region  
- [ ] Commission NI → lead leaves queue  
- [ ] Booking: no auto-select; partial multi-event booking; advance/full in DB  
- [ ] Plan assign highestPrivy round-trip  
- [ ] Bulk plan + config lead sources / budget ranges  
- [ ] Cron expire-leads with `CRON_SECRET`  
- [ ] Regenerate schema backup: `node scripts/generate-schema-backup-md.mjs`  

---

## Open questions for product owner

1. **#01 vs #07:** Tab on assign page **and** standalone assigned-leads page — both or merge?  
2. **#22:** Soft cancel (`cancelled` flag) vs existing `DELETE /api/bookings/[id]`?  
3. **#32:** Apply roster filters to commission MUA page (different UI today)?  
4. **#31:** Exact expiry rule — no future `lead_events` vs lead-level `event_date` passed?  
5. **Reassign to portal:** Should `status` stay `verified` or change?  

---

*Generated from codebase review. Implement phase-by-phase; update this doc as items ship.*

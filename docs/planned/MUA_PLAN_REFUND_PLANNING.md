# MUA plan refund — planning doc

> **Status:** Planning only — no implementation yet.  
> **Last updated:** 2026-07-29  
> **Scope:** CRM portal (`sales.*`, `rm.muas`, payments, targets, reports)

---

## Problem statement

Sometimes an MUA buys a plan, money is collected, and the business must **refund the MUA and end the plan**. Today there is no refund flow. The closest operation is admin **remove plan**, which clears live plan fields but does **not** reverse payments, pipeline state, activation, or sales attribution.

Goal: design a refund capability that **coordinates money, plan, and deal state** without breaking existing revenue, targets, or reporting.

---

## How plan purchase works today

MUA plan purchase is a multi-layer funnel, not a single transaction:

```text
Sales pipeline → payments (payment_records) → onboarding/training → activation → live plan (muas + mua_plan_history)
```

### Three parallel truths

| Layer | Source of truth | What it drives |
|--------|-----------------|----------------|
| **Money** | `sales.payment_records` (append-only positive rows) | Financial report, sales target **revenue**, day-end sales metrics |
| **Deal / attribution** | `sales.pipeline` stage, `sales_closed_by`, `stage_log` | Target **sold** counts, close date, rep credit |
| **Live plan** | `rm.muas` + `rm.mua_plan_history` | Leads, caps, coverage, renewal/re-engage crons |

### Key tables

| Schema | Table | Role |
|--------|-------|------|
| `rm` | `muas` | Live plan: tier, expiry, caps, coverage |
| `rm` | `mua_plan_history` | Append-only plan periods |
| `sales` | `pipeline` | Deal funnel per MUA |
| `sales` | `onboarding` | Plan terms + `quoted_amount` |
| `sales` | `payment_records` | Plan payments (INSERT only in app code) |
| `sales` | `activation_log` | Invoice/contract/activation timestamp |

### Purchase paths

1. **Sales pipeline (normal):** Confirm → Deal Closed (+ payments) → Onboarding → training → activation → `applyOnboardingPlanOnActivation()`.
2. **Admin direct assign:** `PATCH /api/admin/muas/[id]` → `applyAdminPlanToMua()` — may bypass sales payment/activation.

### Related code (reference)

| Area | Path |
|------|------|
| Deal close + payment insert | `lib/sales-pipeline-deal-close.ts` |
| Payment balance / stage resolution | `lib/sales-deal-payment.ts` |
| Activation → live plan | `lib/sales-activation-plan.ts`, `app/api/activation/[pipelineId]/route.ts` |
| Admin plan assign/remove | `lib/admin-apply-plan.ts` |
| Financial report (plan income) | `lib/financial-report-query.ts` |
| Sales targets | `lib/sales-targets.ts` |
| RM targets (bookings — **not** plan sales) | `lib/targets.ts` |
| MUA plan commercial detail | `lib/mua-plan-period-detail.ts` |
| Renewal / re-engage on expiry | `lib/sales-renewal-track.ts`, `lib/sales-plan-expiry.ts` |

---

## What “refund” means — business cases

Define these **before** schema or UI:

| Scenario | Plan live? | Typical ask |
|----------|------------|-------------|
| **A. Pre-activation** | No (`activated_at` null) | Paid but never activated — full refund |
| **B. Post-activation, early exit** | Yes | Refund remainder / pro-rata |
| **C. Post-activation, full reversal** | Yes | Rare; policy says non-refundable; ops override |
| **D. Partial payment only** | Part Payment stage | Refund collected amount; deal never fully closed |
| **E. Admin-assigned plan** | Maybe | May not map to a sales pipeline |

### Keep separate from day one

- **Plan refund** — subscription money back, plan ended.
- **Lead reversal** — lead credit for partners; **not** a plan refund. Existing support/AI rules treat these differently.

---

## Core design principle: additive ledger + coordinated unwind

### Do not

- Delete or edit `payment_records` rows (reports, discount logic, migration `072` assume append-only positive payments).
- Reopen `Deal Closed` as a normal stage (terminal today).
- Only call admin `remove_plan` and stop there.
- Put negative amounts in `payment_records` without auditing every `SUM(amount)` query.

### Do

Introduce an explicit **refund / adjustment ledger** (e.g. `sales.plan_refunds` or `sales.payment_adjustments`) linked to:

- `pipeline_id` (when sales-driven)
- `mua_id` + optional `mua_plan_history` row
- `refund_date`, `amount`, `mode`, `reason`, `approved_by`, `type` (full / partial / goodwill)

One orchestration function (conceptually `processPlanRefund()`) in a **single transaction**:

1. **Validate** — net collected ≥ refund amount; plan period identifiable; approvals if post-activation.
2. **Record refund** — insert adjustment row(s); never mutate original payments.
3. **End plan operationally** — set `plan_expiry` to refund date or remove; append `mua_plan_history` note (“refunded / terminated early”); do not delete history.
4. **Update deal state** — new terminal flag/stage (e.g. `Refunded`); do not reuse `Rejected`.
5. **Fix attribution for reporting** — exclude from targets or reverse per finance rules.
6. **Side effects** — supersede open renewal pipeline, stop lead pushes, audit log.

Financial truth:

```text
net_collected = SUM(payment_records.amount) - SUM(refunds.amount)
```

Every report that today uses naive `SUM(pr.amount)` must switch to **net** (or show gross + refunds + net).

---

## Impact by area

### 1. Revenue & financial reports

**Today:** `financial-report-query.ts` — plan income = `SUM(sales.payment_records.amount)`.

**After refund:** Show collected, refunded, and net (or equivalent drill-down). Refunds hit books by **`refund_date`**, not original `payment_date`, when they fall in a different month.

### 2. Sales targets (high risk)

Targets use **two clocks**:

- **Revenue actual** → `payment_records` by `payment_date` (`lib/sales-targets.ts`)
- **Sold actual** → pipelines in `Onboarding` / `Deal Closed` by close date (`PIPELINE_CLOSED_AT_SQL`)

Refund without sold adjustment → rep keeps +1 sold and inflated revenue.

**Decisions needed:**

- Same-month refund → reverse revenue and sold in that month?
- Cross-month refund → revenue in refund month; sold in original close month?

Per-tier `planSold` counts need the same exclusion.

### 3. Payment details & pipeline UI

**Today:** Balance = `quoted_amount` vs `SUM(payments)`; stage = Onboarding vs Part Payment.

**After refund:** Do **not** send pipeline back to Part Payment. Show quoted, paid, refunded, net retained, status **Refunded (partial/full)** — terminal.

Discount approval (`lib/sales-deal-discount.ts`) errors if `netQuoted < totalPaid`; frozen/refunded pipelines should not re-enter discount flows.

### 4. Activation & plan history

Activation is one-way. Refund must end the current period, leave `activation_log` for audit, and surface refund in MUA commercial UI (same pattern as payments in `mua-plan-period-detail.ts`).

### 5. Renewal / re-engage crons

Mid-period refund must supersede `renewal_attempt` and block T-30 / expired-plan crons from opening new sales pipelines for refunded MUAs (pattern exists for admin extension in `lib/sales-renewal-track.ts`).

### 6. RM targets & booking commission

`rm.rm_targets` and `rm.bookings.commission_*` are **separate** from plan sales. Plan refunds must not touch booking commission. Bride booking cancel is a different feature.

### 7. Day-end, AI, support

Sales day-end autofill reads `payment_records` for revenue metrics — needs net logic if refunds exist.

Support/AI state plans are non-refundable once activated (`lib/support-public-facts.ts`, `lib/ai-domains.ts`). Real refund capability requires policy tiers and updated advisor copy.

### 8. Admin direct plan assign

Support **refund against pipeline** (normal) and **standalone MUA refund** (admin-only, no fake pipeline).

---

## Suggested CRM workflow (portal)

Admin/finance-led initially:

```text
[Request] → MUA + plan period (+ pipeline if exists)
         → show: quoted, paid, refunded, net, activated?, days used
         → refund type: full | partial
         → reason + notes + approval (post-activation)
         → preview target impact
         → confirm → atomic unwind
         → audit + optional finance export
```

**Permissions:** Admin/owner execute; sales may request only.

---

## Invariants checklist

1. Append-only `payment_records` — original rows never change.
2. Net revenue everywhere — one shared helper for financial report, targets, day-end, MUA portal.
3. Terminal deal states — Refunded is terminal; no accidental Part Payment transitions.
4. History is narrative — `mua_plan_history`, `stage_log`, `activation_log` stay; add refund events.
5. Attribution is explicit — finance rule for whether refunded deals count as sold.
6. Renewal crons respect refunded state.
7. Lead reversal ≠ plan refund.
8. Booking commission isolation.

---

## Open decisions

1. **Phase 1 scope:** Pre-activation only vs post-activation from day one?
2. **Target reversal:** Same-month vs cross-month rules?
3. **Partial refund:** Plan always ends fully, or shortened expiry?
4. **Approvals:** Post-activation — owner only?
5. **Standalone refunds** for admin-assigned plans without payment records?
6. **Reporting:** Gross + refunds + net vs net-only with drill-down?

---

## Suggested phasing

| Phase | Scope | Risk |
|-------|--------|------|
| **0** | Design doc + inventory every `SUM(payment_records)` and sold-count query | Low |
| **1** | Ledger + net revenue in reports (no UI; manual/admin script) | Medium |
| **2** | Pre-activation refund UI — full refund only | Medium |
| **3** | Post-activation refund + approvals + renewal supersede | High |
| **4** | Target reversal rules + rep dashboards | High |

---

## Example walkthrough (for a future design session)

**Prime plan, ₹50k paid, activated 2 weeks ago, full refund requested.**

Trace every touchpoint:

- Insert refund row(s) linked to pipeline + MUA + history period
- Set plan expiry / remove live plan; history note
- Mark pipeline refunded (terminal)
- Exclude from `fetchSalesTargetActuals` revenue and sold for attributed rep
- Supersede renewal attempt / close renewal pipeline if open
- Financial report: ₹50k collected, ₹50k refunded, ₹0 net in refund month
- MUA portal commercial tab shows refund line
- No change to `rm.bookings` or RM commission targets

---

## Appendix: task display ID fix vs day-end reports

**Investigated 2026-07-29** after CRM task race fix (`99625c1` — `lib/task-display-id.ts`, `POST /api/tasks`).

### What changed

- Manual task create (`POST /api/tasks`) now runs in a transaction with retry on `rm_tasks_display_id_key` duplicate.
- `generateTaskDisplayId()` itself is **unchanged** (still `MAX(TK-n)+1` on `rm_tasks`).
- Automated task creation paths (deal close, activation, pipeline stage, etc.) were **not** modified.

### Day-end report usage of tasks

Day-end autofill (`lib/day-end-autofill.ts`) uses `rm_tasks` only for:

| Function | Usage |
|----------|--------|
| `autofillSalesOpsDayEnd` | `COUNT(*)` where `status = 'done'` and `updated_at::date = reportDate` |
| `autofillLeadUploaderDayEnd` | Same tasks-closed count |
| `autofillFeedbackDayEnd` | `NOT EXISTS` pending `feedback_follow_up` / `feedback_referral_follow_up` tasks |

Day-end does **not** read task `display_id` (`TK-*`). Lead rows in day-end use **lead** `display_id` (`LD-*`).

Stored day-end payloads live in `rm.day_end_checkouts` (JSON). Submit/read paths in `lib/day-end-queries.ts` do not reference `rm_tasks`.

### HRMS CRM day-end email

The HRMS morning CRM day-end summary (`hrms/lib/crm-day-end-summary.ts`) reads `rm.day_end_checkouts` and `rm.staff` only. **No dependency on tasks or task display IDs.**

### Conclusion

**No — the task display ID fix does not change day-end report logic, queries, or stored payloads.**

Indirect effect only: before the fix, concurrent **manual** `POST /api/tasks` could fail with duplicate key → task never created → that task could not be completed → `tasksClosed` count in day-end autofill could be **understated**. The fix makes manual creates more reliable; it does not alter counts for tasks created through other paths (where the same race can still exist until those paths get the same retry helper).

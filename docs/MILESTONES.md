# Olready CRM – Milestones

Checkpoints for reverting if changes go wrong. Update this file when creating a new milestone.

---

## M0 – Baseline (Feb 2026)

**State:** Current working system before any new changes.

- **Codebase:** `crm/` Next.js 14 app
- **Schema:** See `docs/SCHEMA.md` (8 tables: users, bdms, plans, teams, leads, activity, tasks, bdm_log)
- **Plan:** `docs/FINAL_PLAN.md`
- **Key flows:** Login → Dashboard, Leads, Pipeline, Payment Pending, Tasks, Calendar, Reports, Admin
- **Roles:** admin, team_leader, bdm
- **Revert:** Restore from this state if needed

---

## M1 – Pre PARTLY_PAID (Feb 2026)

**State:** Before adding PARTLY_PAID stage. BDM filter fix applied.

- **Changes since M0:** BDM filter in Leads/Pipeline now works (`/api/leads` reads `bdm` param)
- **Revert:** Restore `app/api/leads/route.ts` to remove bdmParam handling

---

## M2 – PARTLY_PAID stage (Feb 2026)

**State:** PARTLY_PAID as explicit stage between CONFIRMED and PAID.

- **Changes:** New status PARTLY_PAID; partial payment → PARTLY_PAID (not CONFIRMED); pipeline, leads, payments, dashboard, reports, calendar, import updated
- **Migration:** `supabase/migrations/005_partly_paid_status.sql` – run to migrate existing part-paid leads
- **Revert:** Revert types, recordPayment, STAGES, filters; run `UPDATE leads SET status='CONFIRMED' WHERE status='PARTLY_PAID'`

---

## M3 – Config & build fixes (Feb 2026)

**State:** Pre-existing config and type errors corrected.

- **Changes:** 
  - `next.config.js`: `serverExternalPackages` → `experimental.serverComponentsExternalPackages` (Next.js 14)
  - `lib/db/config.ts`, `lib/db/config-sheets.ts`: `savePlans` accepts `active?: boolean`, defaults to `true`
- **Revert:** Restore next.config.js and config types to previous state

---

## Adding a Milestone

Before major changes (schema, new features, refactors):

1. Create a git commit with message `milestone: M{n} - {description}` (if using git)
2. Add entry below with: label, date, what changed, revert instructions
3. Keep `docs/SCHEMA.md` in sync if schema changed

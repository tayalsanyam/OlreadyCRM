# Supabase Migrations

Apply migrations so the database has the latest schema (renewal rejected, tasks.renewal_deal_id, etc.).

## Apply migrations

1. **Link your project** (first time only):
   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

2. **Push migrations**:
   ```bash
   npx supabase db push
   ```

Or apply manually in Supabase Dashboard → SQL Editor:
- Run `013_renewal_rejected.sql`
- Run `014_tasks_renewal_deal_id.sql`

## Required for renewal/tasks features

- **013_renewal_rejected.sql** – Adds `RENEWAL_REJECTED` status and `rejection_reason` to `renewal_deals`
- **014_tasks_renewal_deal_id.sql** – Adds `renewal_deal_id` to `tasks` for renewal follow-up tasks

Without these, the renewal reject flow and renewal-specific task completion will not work.

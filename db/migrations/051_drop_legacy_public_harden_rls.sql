-- Drop unused legacy BDM public-schema CRM and harden RLS for backend-only access.

-- ---------------------------------------------------------------------------
-- 1. Legacy public BDM tables (not used by Olready; isolated rm/sales/support app)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS leads_last_modified ON public.leads;
DROP FUNCTION IF EXISTS public.update_leads_last_modified();

DROP TABLE IF EXISTS public.activity CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.renewal_deals CASCADE;
DROP TABLE IF EXISTS public.bdm_log CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.bdms CASCADE;
DROP TABLE IF EXISTS public.plans CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.ops_coordinators CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Pin search_path on app functions (Supabase linter 0011)
-- ---------------------------------------------------------------------------

ALTER FUNCTION rm.compute_urgency_band(date) SET search_path = rm, pg_temp;
ALTER FUNCTION rm.lead_sla_event_date(uuid) SET search_path = rm, pg_temp;
ALTER FUNCTION rm.capture_audit_log() SET search_path = rm, pg_temp;
ALTER FUNCTION support.generate_ticket_number() SET search_path = support, pg_temp;

-- ---------------------------------------------------------------------------
-- 3. RLS: enable on all app tables + deny PostgREST roles (anon/authenticated)
--    Server connects as postgres (bypasses RLS); blocks accidental API exposure.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('rm', 'sales', 'support')
      AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schema_name, r.table_name);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = r.schema_name
        AND p.tablename = r.table_name
        AND p.policyname = 'backend_only_no_api'
    ) THEN
      EXECUTE format(
        'CREATE POLICY backend_only_no_api ON %I.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        r.schema_name,
        r.table_name
      );
    END IF;
  END LOOP;
END $$;

-- Per-event budgets and portal-only lead routing
ALTER TABLE rm.lead_events
  ADD COLUMN IF NOT EXISTS budget_amount NUMERIC(12, 2);

ALTER TABLE rm.bride_leads
  ADD COLUMN IF NOT EXISTS portal_only BOOLEAN NOT NULL DEFAULT false;

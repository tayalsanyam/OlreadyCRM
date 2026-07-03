-- Admin-assigned plan coverage fields (parity with sales onboarding / activation)
ALTER TABLE muas
  ADD COLUMN IF NOT EXISTS lead_cap INT,
  ADD COLUMN IF NOT EXISTS lead_budget TEXT,
  ADD COLUMN IF NOT EXISTS plan_states TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS plan_cities TEXT[] NOT NULL DEFAULT '{}';

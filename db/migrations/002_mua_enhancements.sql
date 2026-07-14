-- MUA profile enhancements + plan history (rm schema)

ALTER TABLE rm.muas
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  ADD COLUMN IF NOT EXISTS specialties TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assigned_rm_id UUID REFERENCES rm.staff(id),
  ADD COLUMN IF NOT EXISTS join_date DATE DEFAULT CURRENT_DATE;

ALTER TABLE rm.plan_tiers
  ADD COLUMN IF NOT EXISTS monthly_push_target INT;

UPDATE rm.plan_tiers SET monthly_push_target = CASE tier
  WHEN 'highest_privy' THEN 200
  WHEN 'phoenix_2'     THEN 28
  WHEN 'phoenix'       THEN 28
  WHEN 'pro'           THEN 8
  WHEN 'prime'         THEN 4
  ELSE monthly_push_target
END;

CREATE TABLE IF NOT EXISTS rm.mua_plan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mua_id UUID NOT NULL REFERENCES rm.muas(id) ON DELETE CASCADE,
  plan_tier rm.plan_tier,
  assigned_by UUID REFERENCES rm.staff(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expiry_at DATE,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_rm_mua_plan_history_mua
  ON rm.mua_plan_history(mua_id, assigned_at DESC);

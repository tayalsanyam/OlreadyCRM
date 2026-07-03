-- Portal flags, auto-assign, plan assured bookings

ALTER TABLE rm.bride_leads
  ADD COLUMN IF NOT EXISTS portal_pushed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_pushed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_cap INT;

ALTER TABLE rm.sla_config
  ADD COLUMN IF NOT EXISTS auto_assign_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_assign_by TEXT NOT NULL DEFAULT 'least_load';

ALTER TABLE rm.plan_tiers
  ADD COLUMN IF NOT EXISTS assured_bookings INT;

ALTER TABLE rm.plan_tiers
  ADD COLUMN IF NOT EXISTS monthly_push_target INT;

UPDATE rm.plan_tiers SET monthly_push_target = CASE tier
  WHEN 'highest_privy' THEN 200
  WHEN 'phoenix_2'     THEN 28
  WHEN 'phoenix'       THEN 28
  WHEN 'pro'           THEN 8
  WHEN 'prime'         THEN 4
  ELSE monthly_push_target
END
WHERE monthly_push_target IS NULL;

UPDATE rm.plan_tiers SET assured_bookings = CASE tier
  WHEN 'highest_privy' THEN 8
  WHEN 'phoenix_2'     THEN 2
  WHEN 'phoenix'       THEN 1
  WHEN 'pro'           THEN 0
  WHEN 'prime'         THEN 0
  ELSE assured_bookings
END
WHERE assured_bookings IS NULL;

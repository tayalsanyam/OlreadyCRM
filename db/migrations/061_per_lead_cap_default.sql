-- Raise per-lead cap default from 3 to 12 (active conversations per bride lead).
ALTER TABLE sla_config
  ALTER COLUMN per_lead_cap SET DEFAULT 12;

UPDATE sla_config
SET per_lead_cap = 12
WHERE id = 1 AND per_lead_cap = 3;

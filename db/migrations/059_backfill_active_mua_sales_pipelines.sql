-- Backfill unassigned sales pipelines for active MUAs missing one.
-- Segment: renewal (on active plan) > lapsed (plan history) > candidate.

INSERT INTO sales.pipeline (mua_id, mua_type, stage, status, assigned_to)
SELECT
  m.id,
  CASE
    WHEN m.plan_tier IS NOT NULL
      AND (m.plan_expiry IS NULL OR m.plan_expiry >= CURRENT_DATE)
      THEN 'renewal'
    WHEN EXISTS (SELECT 1 FROM rm.mua_plan_history h WHERE h.mua_id = m.id) THEN 'lapsed'
    ELSE 'candidate'
  END,
  'Untouched',
  'active',
  NULL
FROM rm.muas m
WHERE m.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM sales.pipeline p
    WHERE p.mua_id = m.id
      AND p.status = 'active'
      AND p.stage <> 'Rejected'
  );

-- Align existing pipeline segments for active plan customers.
UPDATE sales.pipeline sp
SET mua_type = 'renewal'
FROM rm.muas m
WHERE sp.mua_id = m.id
  AND sp.status = 'active'
  AND sp.stage <> 'Rejected'
  AND m.plan_tier IS NOT NULL
  AND (m.plan_expiry IS NULL OR m.plan_expiry >= CURRENT_DATE)
  AND sp.mua_type <> 'renewal';

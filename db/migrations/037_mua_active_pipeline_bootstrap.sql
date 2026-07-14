-- Roster: candidate was a mistaken roster status; uploaded MUAs should be active.
UPDATE rm.muas SET status = 'active' WHERE status = 'candidate';

-- Backfill unassigned sales pipelines (segment from plan history).
INSERT INTO sales.pipeline (mua_id, mua_type, stage, status, assigned_to)
SELECT
  m.id,
  CASE
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

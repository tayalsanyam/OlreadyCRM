-- Universal owner handover epoch for intake counting (all RM reassignment types).

ALTER TABLE rm.bride_leads
  ADD COLUMN IF NOT EXISTS owner_assigned_at TIMESTAMPTZ;

COMMENT ON COLUMN rm.bride_leads.owner_assigned_at IS
  'When the current assigned_rm_id took ownership; intake counts pushes created after this time.';

UPDATE rm.bride_leads bl
SET owner_assigned_at = COALESCE(
  bl.shifted_at,
  bl.assignment_date::timestamptz,
  bl.created_at
)
WHERE bl.assigned_rm_id IS NOT NULL
  AND bl.owner_assigned_at IS NULL;

-- Plan RM: regional RM responsible for plan MUA issues (set at activation when RM support = Yes).
-- Distinct from assigned_rm_id (lead/booking assignment).

ALTER TABLE rm.muas
  ADD COLUMN IF NOT EXISTS plan_rm_id UUID REFERENCES rm.staff(id);

CREATE INDEX IF NOT EXISTS idx_muas_plan_rm
  ON rm.muas(plan_rm_id)
  WHERE plan_rm_id IS NOT NULL;

COMMENT ON COLUMN rm.muas.plan_rm_id IS
  'Regional RM assigned as Plan RM at activation (RM support deals). Not the same as assigned_rm_id on leads.';

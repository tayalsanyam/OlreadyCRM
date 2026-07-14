ALTER TABLE rm.rm_targets
  ADD COLUMN IF NOT EXISTS target_commission NUMERIC(14, 2);

COMMENT ON COLUMN rm.rm_targets.target_commission IS
  'Monthly commission collection target (INR) for commission RMs';

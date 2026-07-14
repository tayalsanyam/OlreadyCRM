-- Admin plan controls on active MUAs: cap override, bonus pushes, priority tags
ALTER TABLE muas
  ADD COLUMN IF NOT EXISTS weekly_cap_override INT,
  ADD COLUMN IF NOT EXISTS weekly_cap_bonus INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_plan_tag TEXT CHECK (
    admin_plan_tag IS NULL
    OR admin_plan_tag IN ('high_priority', 'low_priority', 'hold')
  );

CREATE INDEX IF NOT EXISTS idx_muas_admin_plan_tag ON muas(admin_plan_tag)
  WHERE admin_plan_tag IS NOT NULL;

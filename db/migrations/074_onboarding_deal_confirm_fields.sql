-- RM Support and Lead Reversal captured at Confirm / Deal Closed.

ALTER TABLE sales.onboarding
  ADD COLUMN IF NOT EXISTS rm_support BOOLEAN,
  ADD COLUMN IF NOT EXISTS lead_reversal_offered BOOLEAN;

-- Profile link must be non-empty for training to count as complete.
UPDATE sales.training
SET complete = (
  profile_link IS NOT NULL
  AND BTRIM(profile_link) <> ''
  AND step_lead_unlock AND step_lead_budget AND step_lead_reversal
  AND step_role_of_rm AND step_rm_contact AND step_lead_views
);

-- Pipelines that finished training but stayed on Onboarding → Deal Closed.
WITH moved AS (
  UPDATE sales.pipeline p
  SET stage = 'Deal Closed', updated_at = NOW()
  WHERE p.stage = 'Onboarding'
    AND p.status = 'active'
    AND EXISTS (
      SELECT 1 FROM sales.training t
      WHERE t.pipeline_id = p.id AND t.complete = true
    )
  RETURNING p.id, p.assigned_to
)
INSERT INTO sales.stage_log (pipeline_id, from_stage, to_stage, changed_by, note)
SELECT
  moved.id,
  'Onboarding',
  'Deal Closed',
  moved.assigned_to,
  'Backfill — training was already complete'
FROM moved;

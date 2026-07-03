-- Plans shared at Details Shared; quoted amount at Confirm; JSON plan options

ALTER TABLE sales.onboarding
  ADD COLUMN IF NOT EXISTS plans_shared JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quoted_amount NUMERIC(12, 2);

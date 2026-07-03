-- Rejection history survives reassign; junk split by customer history

ALTER TABLE sales.pipeline
  ADD COLUMN IF NOT EXISTS rejection_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sales.pipeline_rejection_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES sales.pipeline(id) ON DELETE CASCADE,
  rejection_reason TEXT,
  rejection_note TEXT,
  rejected_by UUID REFERENCES rm.staff(id),
  rejected_at TIMESTAMPTZ NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_rejection_log_pipeline
  ON sales.pipeline_rejection_log (pipeline_id, rejected_at DESC);

ALTER TABLE sales.pipeline_junk
  ADD COLUMN IF NOT EXISTS customer_segment TEXT
    CHECK (customer_segment IS NULL OR customer_segment IN ('prospect', 'ex_customer'));

COMMENT ON COLUMN sales.pipeline_junk.customer_segment IS
  'prospect = never had a plan; ex_customer = had mua_plan_history';

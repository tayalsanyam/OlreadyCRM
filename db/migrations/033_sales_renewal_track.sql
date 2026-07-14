-- T-30 renewal outreach track (one attempt per plan period)

CREATE TABLE IF NOT EXISTS sales.renewal_attempt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mua_id UUID NOT NULL REFERENCES rm.muas(id),
  plan_history_id UUID REFERENCES rm.mua_plan_history(id),
  plan_period_key TEXT NOT NULL,
  triggered_for_expiry DATE NOT NULL,
  pipeline_id UUID REFERENCES sales.pipeline(id),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome TEXT NOT NULL DEFAULT 'pending',
  outcome_at TIMESTAMPTZ,
  CONSTRAINT renewal_attempt_outcome_check CHECK (
    outcome IN (
      'pending',
      'renewed',
      'lapsed_without_renewal',
      'rejected',
      'junked',
      'superseded_by_admin_extension'
    )
  ),
  CONSTRAINT renewal_attempt_mua_period_unique UNIQUE (mua_id, plan_period_key)
);

CREATE INDEX IF NOT EXISTS idx_sales_renewal_attempt_mua
  ON sales.renewal_attempt (mua_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_renewal_attempt_pipeline
  ON sales.renewal_attempt (pipeline_id)
  WHERE pipeline_id IS NOT NULL;

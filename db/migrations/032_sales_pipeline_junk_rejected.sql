-- Rejected metadata on pipeline + junk archive reference table

ALTER TABLE sales.pipeline
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejection_note TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES rm.staff(id);

CREATE TABLE IF NOT EXISTS sales.pipeline_junk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES sales.pipeline(id),
  mua_id UUID NOT NULL REFERENCES rm.muas(id),
  mua_type TEXT NOT NULL,
  mua_name TEXT NOT NULL,
  mua_city TEXT,
  mua_source TEXT,
  mua_phone TEXT,
  assigned_to_id UUID REFERENCES rm.staff(id),
  assigned_to_name TEXT,
  rejection_reason TEXT,
  rejection_note TEXT,
  junk_reason TEXT,
  junked_by UUID NOT NULL REFERENCES rm.staff(id),
  junked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sales_pipeline_junk_junked_at
  ON sales.pipeline_junk (junked_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_pipeline_rejected_active
  ON sales.pipeline (rejected_at DESC NULLS LAST)
  WHERE status = 'active' AND stage = 'Rejected';

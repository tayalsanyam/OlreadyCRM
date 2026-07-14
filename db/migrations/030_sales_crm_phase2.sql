-- Sales CRM phase 2: notes, assignment log, profile fields

ALTER TABLE sales.pipeline
  ADD COLUMN IF NOT EXISTS sales_notes TEXT,
  ADD COLUMN IF NOT EXISTS preferred_contact_time TEXT;

CREATE TABLE IF NOT EXISTS sales.assignment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES sales.pipeline(id) ON DELETE CASCADE,
  from_staff_id UUID REFERENCES rm.staff(id),
  to_staff_id UUID REFERENCES rm.staff(id),
  changed_by UUID NOT NULL REFERENCES rm.staff(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_assignment_log_pipeline ON sales.assignment_log(pipeline_id);

ALTER TABLE rm.muas
  ADD COLUMN IF NOT EXISTS preferred_contact_channel TEXT;

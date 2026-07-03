CREATE TABLE IF NOT EXISTS rm.day_end_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES rm.staff(id),
  report_date DATE NOT NULL,
  template_key TEXT NOT NULL,
  submission_type TEXT NOT NULL CHECK (submission_type IN ('report', 'leave')),
  payload JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, report_date)
);

CREATE INDEX IF NOT EXISTS day_end_checkouts_report_date_idx
  ON rm.day_end_checkouts (report_date DESC);

CREATE INDEX IF NOT EXISTS day_end_checkouts_staff_id_idx
  ON rm.day_end_checkouts (staff_id);

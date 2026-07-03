CREATE TABLE IF NOT EXISTS rm.custom_report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL CHECK (report_type IN ('backend', 'sales')),
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES rm.staff(id),
  updated_by UUID REFERENCES rm.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_type, name)
);

CREATE INDEX IF NOT EXISTS idx_custom_report_templates_type
  ON rm.custom_report_templates(report_type, updated_at DESC);

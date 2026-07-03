-- Admin-managed service catalog + extended MUA profile (mirrors activation/onboarding fields)

CREATE TABLE IF NOT EXISTS rm.mua_service_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  base_amount NUMERIC(12, 2),
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO rm.mua_service_catalog (name, base_amount, sort_order) VALUES
  ('Bridal makeup', 25000, 1),
  ('Reception makeup', 18000, 2),
  ('Sangeet makeup', 15000, 3),
  ('Engagement makeup', 12000, 4),
  ('HD makeup', NULL, 5),
  ('Airbrush makeup', NULL, 6),
  ('On-location', NULL, 7),
  ('Trial session', 5000, 8),
  ('Hair styling', 8000, 9),
  ('Draping / saree', 3000, 10)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE rm.muas
  ADD COLUMN IF NOT EXISTS service_offerings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS official_address TEXT,
  ADD COLUMN IF NOT EXISTS gst_number TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS alternate_phone TEXT,
  ADD COLUMN IF NOT EXISTS business_manager_phone TEXT,
  ADD COLUMN IF NOT EXISTS avg_revenue_target NUMERIC(12, 2);

COMMENT ON COLUMN rm.muas.service_offerings IS
  'JSON array: [{ catalogId?, name, baseAmount? }] — editable by admin, sales, and backend RMs';

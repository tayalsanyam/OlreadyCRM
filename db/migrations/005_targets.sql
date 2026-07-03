CREATE TABLE IF NOT EXISTS rm.rm_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES rm.staff(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  target_bookings INT NOT NULL DEFAULT 0,
  target_leads_worked INT NOT NULL DEFAULT 0,
  target_avg_muas_per_lead NUMERIC(4,1) DEFAULT 3.0,
  notes TEXT,
  set_by UUID REFERENCES rm.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id, period_start)
);

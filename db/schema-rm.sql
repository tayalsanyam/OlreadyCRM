-- Olready RM Platform — isolated schema (does not touch public.*)
-- Apply to Supabase alongside existing BDM/sales tables in public.

CREATE SCHEMA IF NOT EXISTS rm;

-- Enums (rm schema only)
CREATE TYPE rm.user_role AS ENUM (
  'regional_rm',
  'commission_rm',
  'lead_uploader',
  'feedback_rm',
  'admin',
  'owner'
);

CREATE TYPE rm.region AS ENUM ('north', 'east', 'west', 'south');

CREATE TYPE rm.budget_tier AS ENUM ('tier_1', 'tier_2', 'tier_3', 'tier_4');

CREATE TYPE rm.lead_status AS ENUM (
  'pending_verification',
  'verified',
  'assigned',
  'commission_rm',
  'booked',
  'archived',
  'missed'
);

CREATE TYPE rm.urgency_band AS ENUM ('critical', 'hot', 'active', 'long_shelf');

CREATE TYPE rm.plan_tier AS ENUM (
  'highest_privy',
  'phoenix_2',
  'phoenix',
  'pro',
  'prime'
);

CREATE TYPE rm.mua_push_stage AS ENUM (
  'initial_contact',
  'offer_sent',
  'follow_up_done',
  'negotiating',
  'bride_selected'
);

CREATE TYPE rm.mua_push_status AS ENUM (
  'active',
  'closed',
  'booked',
  'awaiting_close'
);

CREATE TYPE rm.push_outcome AS ENUM ('not_selected', 'withdrew', 'not_interested');

CREATE TYPE rm.event_status AS ENUM ('open', 'booked', 'not_needed');

CREATE TYPE rm.comm_entry_type AS ENUM (
  'lead_created',
  'lead_verified',
  'assigned',
  'mua_pushed',
  'stage_updated',
  'cap_bypass',
  'call_logged',
  'whatsapp_logged',
  'shifted_commission',
  'hostile_flagged',
  'close_confirmation',
  'conversation_closed',
  'booking_confirmed',
  'soft_checkin',
  'note'
);

CREATE TYPE rm.task_type AS ENUM (
  'close_conversation',
  'follow_up',
  'admin_review',
  'shift_warning'
);

CREATE TYPE rm.task_status AS ENUM ('pending', 'done', 'cancelled');

-- Staff (RM platform users — not public.users BDM accounts)
CREATE TABLE rm.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role rm.user_role NOT NULL,
  region rm.region,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Plan tiers + weekly caps (not public.plans sales pricing)
CREATE TABLE rm.plan_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier rm.plan_tier NOT NULL UNIQUE,
  name TEXT NOT NULL,
  weekly_cap INT NOT NULL,
  monthly_push_target INT,
  assured_bookings INT,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rm.rm_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES rm.staff(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  target_bookings INT NOT NULL DEFAULT 0,
  target_leads_worked INT NOT NULL DEFAULT 0,
  target_avg_muas_per_lead NUMERIC(4, 1) DEFAULT 3.0,
  notes TEXT,
  set_by UUID REFERENCES rm.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id, period_start)
);

CREATE TABLE rm.sla_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  per_lead_cap INT NOT NULL DEFAULT 12,
  assignment_window_days INT NOT NULL DEFAULT 45,
  shift_warning_day INT NOT NULL DEFAULT 40,
  inactivity_threshold_hours INT NOT NULL DEFAULT 48,
  cap_bypass_days INT NOT NULL DEFAULT 30,
  critical_max_days INT NOT NULL DEFAULT 30,
  hot_max_days INT NOT NULL DEFAULT 45,
  active_max_days INT NOT NULL DEFAULT 90,
  ceremony_types JSONB NOT NULL DEFAULT '["Haldi","Mehndi","Sangeet","Wedding","Reception"]'::jsonb,
  auto_assign_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_assign_by TEXT NOT NULL DEFAULT 'least_load',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rm.bride_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  bride_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  city TEXT NOT NULL,
  region rm.region,
  event_location TEXT,
  event_date DATE NOT NULL,
  budget_amount NUMERIC(12, 2),
  budget_tier rm.budget_tier NOT NULL,
  source TEXT,
  status rm.lead_status NOT NULL DEFAULT 'pending_verification',
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES rm.staff(id),
  assigned_rm_id UUID REFERENCES rm.staff(id),
  assignment_date DATE,
  shifted_at TIMESTAMPTZ,
  owner_assigned_at TIMESTAMPTZ,
  handover_reason TEXT,
  group_size INT,
  group_notes TEXT,
  hostile_note TEXT,
  portal_pushed BOOLEAN NOT NULL DEFAULT false,
  portal_pushed_at TIMESTAMPTZ,
  portal_cap INT,
  -- Optional external sales CRM reference (text id, not FK)
  public_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rm.muas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  bio TEXT,
  services TEXT[] DEFAULT '{}',
  plan_tier rm.plan_tier,
  plan_expiry DATE,
  status TEXT NOT NULL DEFAULT 'active',
  public_lead_id TEXT,
  whatsapp TEXT,
  instagram TEXT,
  specialties TEXT[] DEFAULT '{}',
  assigned_rm_id UUID REFERENCES rm.staff(id),
  join_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rm.mua_regions (
  mua_id UUID NOT NULL REFERENCES rm.muas(id) ON DELETE CASCADE,
  region rm.region NOT NULL,
  PRIMARY KEY (mua_id, region)
);

CREATE INDEX idx_rm_mua_regions_region ON rm.mua_regions(region);

CREATE TABLE rm.mua_plan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mua_id UUID NOT NULL REFERENCES rm.muas(id) ON DELETE CASCADE,
  plan_tier rm.plan_tier,
  assigned_by UUID REFERENCES rm.staff(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expiry_at DATE,
  notes TEXT
);

CREATE INDEX idx_rm_mua_plan_history_mua ON rm.mua_plan_history(mua_id, assigned_at DESC);

CREATE TABLE rm.lead_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES rm.bride_leads(id) ON DELETE CASCADE,
  ceremony_type TEXT NOT NULL,
  event_date DATE,
  event_location TEXT,
  region rm.region,
  status rm.event_status NOT NULL DEFAULT 'open',
  mua_id UUID REFERENCES rm.muas(id),
  booked_price NUMERIC(12, 2),
  budget_amount NUMERIC(12, 2),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rm.mua_pushes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES rm.bride_leads(id) ON DELETE CASCADE,
  mua_id UUID NOT NULL REFERENCES rm.muas(id),
  stage rm.mua_push_stage NOT NULL DEFAULT 'initial_contact',
  status rm.mua_push_status NOT NULL DEFAULT 'active',
  outcome rm.push_outcome,
  quoted_total NUMERIC(12, 2),
  event_ids UUID[] NOT NULL DEFAULT '{}',
  bypass_reason TEXT,
  pushed_by UUID NOT NULL REFERENCES rm.staff(id),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rm.mua_push_event_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  push_id UUID NOT NULL REFERENCES rm.mua_pushes(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES rm.lead_events(id) ON DELETE CASCADE,
  quoted_price NUMERIC(12, 2) NOT NULL,
  UNIQUE (push_id, event_id)
);

CREATE TABLE rm.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES rm.bride_leads(id),
  event_id UUID NOT NULL REFERENCES rm.lead_events(id),
  mua_id UUID NOT NULL REFERENCES rm.muas(id),
  push_id UUID REFERENCES rm.mua_pushes(id),
  booked_price NUMERIC(12, 2) NOT NULL,
  booking_date DATE NOT NULL DEFAULT CURRENT_DATE,
  advance_paid NUMERIC(12, 2),
  full_paid NUMERIC(12, 2),
  payment_mode TEXT CHECK (
    payment_mode IS NULL
    OR payment_mode IN ('upi', 'cash', 'bank_transfer', 'card', 'other')
  ),
  zoho_invoice_ref TEXT,
  commission_amount NUMERIC(12, 2),
  commission_paid NUMERIC(12, 2),
  commission_paid_at TIMESTAMPTZ,
  bride_fully_paid_at TIMESTAMPTZ,
  commission_next_follow_up_at DATE,
  cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_by UUID NOT NULL REFERENCES rm.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rm.comms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES rm.bride_leads(id) ON DELETE CASCADE,
  mua_id UUID REFERENCES rm.muas(id),
  entry_type rm.comm_entry_type NOT NULL,
  description TEXT NOT NULL,
  actor_id UUID REFERENCES rm.staff(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rm.rm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  staff_id UUID NOT NULL REFERENCES rm.staff(id),
  lead_id UUID REFERENCES rm.bride_leads(id),
  push_id UUID REFERENCES rm.mua_pushes(id),
  task_type rm.task_type NOT NULL,
  title TEXT NOT NULL,
  due_date DATE,
  status rm.task_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rm.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES rm.staff(id),
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rm.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES rm.staff(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rm_bride_leads_status ON rm.bride_leads(status);
CREATE INDEX idx_rm_bride_leads_region ON rm.bride_leads(region);
CREATE INDEX idx_rm_bride_leads_assigned_rm ON rm.bride_leads(assigned_rm_id);
CREATE INDEX idx_rm_mua_pushes_lead ON rm.mua_pushes(lead_id);
CREATE INDEX idx_rm_mua_pushes_mua ON rm.mua_pushes(mua_id);
CREATE INDEX idx_rm_comms_lead ON rm.comms(lead_id);
CREATE INDEX idx_rm_comms_mua_id ON rm.comms(mua_id);
CREATE INDEX idx_rm_tasks_staff ON rm.rm_tasks(staff_id);
CREATE INDEX idx_rm_notifications_staff ON rm.notifications(staff_id, read);

CREATE OR REPLACE FUNCTION rm.compute_urgency_band(p_event_date DATE)
RETURNS rm.urgency_band AS $$
DECLARE
  d INT;
  cfg rm.sla_config%ROWTYPE;
BEGIN
  SELECT * INTO cfg FROM rm.sla_config WHERE id = 1;
  d := p_event_date - CURRENT_DATE;
  IF d <= cfg.critical_max_days THEN RETURN 'critical';
  ELSIF d <= cfg.hot_max_days THEN RETURN 'hot';
  ELSIF d <= cfg.active_max_days THEN RETURN 'active';
  ELSE RETURN 'long_shelf';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE VIEW rm.leads_full AS
SELECT
  bl.*,
  rm.compute_urgency_band(bl.event_date) AS urgency_band,
  (bl.event_date - CURRENT_DATE) AS days_to_event,
  CASE
    WHEN bl.assignment_date IS NULL THEN NULL
    ELSE GREATEST(0, (SELECT assignment_window_days FROM rm.sla_config WHERE id = 1) - (CURRENT_DATE - bl.assignment_date))
  END AS assignment_days_remaining,
  CASE
    WHEN bl.assignment_date IS NULL THEN NULL
    ELSE (CURRENT_DATE - bl.assignment_date)
  END AS days_since_assignment,
  s.name AS assigned_rm_name,
  (SELECT COUNT(*)::int FROM rm.mua_pushes mp WHERE mp.lead_id = bl.id AND mp.status NOT IN ('closed', 'booked')) AS active_pushes_count,
  (SELECT COUNT(DISTINCT mp.mua_id)::int FROM rm.mua_pushes mp WHERE mp.lead_id = bl.id) AS muas_offered_count,
  (
    SELECT string_agg(names.name, ', ' ORDER BY names.name)
    FROM (
      SELECT DISTINCT m.name
      FROM rm.mua_pushes mp
      JOIN rm.muas m ON m.id = mp.mua_id
      WHERE mp.lead_id = bl.id
    ) names
  ) AS muas_offered_names,
  (SELECT COUNT(*)::int FROM rm.lead_events le WHERE le.lead_id = bl.id AND le.status != 'not_needed') AS event_count,
  (SELECT COUNT(*)::int FROM rm.lead_events le WHERE le.lead_id = bl.id AND le.status = 'booked') AS booked_event_count,
  (SELECT COUNT(*)::int FROM rm.lead_events le WHERE le.lead_id = bl.id AND le.status = 'open') AS open_event_count,
  (
    SELECT string_agg(le.ceremony_type, ', ' ORDER BY le.event_date NULLS LAST, le.ceremony_type)
    FROM rm.lead_events le
    WHERE le.lead_id = bl.id AND le.status != 'not_needed'
  ) AS event_labels,
  (SELECT MAX(c.created_at) FROM rm.comms c WHERE c.lead_id = bl.id) AS last_activity_at
FROM rm.bride_leads bl
LEFT JOIN rm.staff s ON s.id = bl.assigned_rm_id;

-- RLS: enabled, no policies — server uses service role / direct connection only
ALTER TABLE rm.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.plan_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.sla_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.bride_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.muas ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.mua_pushes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.mua_push_event_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.comms ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.rm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.notifications ENABLE ROW LEVEL SECURITY;

INSERT INTO rm.plan_tiers (tier, name, weekly_cap, monthly_push_target, sort_order) VALUES
  ('highest_privy', 'Privy', 10, 200, 1),
  ('phoenix_2', 'Phoenix 2', 7, 28, 2),
  ('phoenix', 'Phoenix', 7, 28, 3),
  ('pro', 'Pro', 2, 8, 4),
  ('prime', 'Prime', 1, 4, 5)
ON CONFLICT (tier) DO NOTHING;

INSERT INTO rm.sla_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

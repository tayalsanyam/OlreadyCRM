-- Sales CRM foundation aligned with current rm schema (rm.staff UUID ids)

CREATE SCHEMA IF NOT EXISTS sales;

ALTER TYPE rm.user_role ADD VALUE IF NOT EXISTS 'sales_rm';
ALTER TYPE rm.user_role ADD VALUE IF NOT EXISTS 'sales_tl';
ALTER TYPE rm.user_role ADD VALUE IF NOT EXISTS 'sales_activation';

ALTER TYPE rm.task_type ADD VALUE IF NOT EXISTS 'sales_follow_up';
ALTER TYPE rm.task_type ADD VALUE IF NOT EXISTS 'sales_senior_call';
ALTER TYPE rm.task_type ADD VALUE IF NOT EXISTS 'sales_onboarding';
ALTER TYPE rm.task_type ADD VALUE IF NOT EXISTS 'sales_activation';
ALTER TYPE rm.task_type ADD VALUE IF NOT EXISTS 'sales_assign_rm';

ALTER TABLE rm.staff
  ADD COLUMN IF NOT EXISTS team_id UUID,
  ADD COLUMN IF NOT EXISTS callyzer_number TEXT;

ALTER TABLE rm.muas
  ADD COLUMN IF NOT EXISTS source TEXT CHECK (
    source IS NULL OR source IN ('Inbound', 'Ads', 'Referral', 'Instagram DM', 'Others')
  ),
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS sales_closed_by UUID REFERENCES rm.staff(id),
  ADD COLUMN IF NOT EXISTS team_id UUID;

CREATE TABLE IF NOT EXISTS sales.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tl_id UUID NOT NULL REFERENCES rm.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'rm'
      AND table_name = 'staff'
      AND constraint_name = 'fk_staff_team_sales'
  ) THEN
    ALTER TABLE rm.staff
      ADD CONSTRAINT fk_staff_team_sales
      FOREIGN KEY (team_id) REFERENCES sales.teams(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'rm'
      AND table_name = 'muas'
      AND constraint_name = 'fk_muas_team_sales'
  ) THEN
    ALTER TABLE rm.muas
      ADD CONSTRAINT fk_muas_team_sales
      FOREIGN KEY (team_id) REFERENCES sales.teams(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS sales.pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mua_id UUID NOT NULL REFERENCES rm.muas(id) ON DELETE CASCADE,
  mua_type TEXT NOT NULL CHECK (mua_type IN ('candidate', 'lapsed')),
  stage TEXT NOT NULL DEFAULT 'Untouched',
  status TEXT NOT NULL DEFAULT 'active',
  assigned_to UUID REFERENCES rm.staff(id),
  sales_closed_by UUID REFERENCES rm.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales.stage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES sales.pipeline(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES rm.staff(id),
  note TEXT,
  next_touch_point DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales.payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES sales.pipeline(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_mode TEXT NOT NULL CHECK (
    payment_mode IN ('UPI', 'Cash', 'Bank Transfer', 'Card', 'Other')
  ),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales.onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL UNIQUE REFERENCES sales.pipeline(id) ON DELETE CASCADE,
  mua_name TEXT,
  business_name TEXT,
  official_address TEXT,
  gst_number TEXT,
  email TEXT,
  alternate_phone TEXT,
  business_manager_phone TEXT,
  plan TEXT,
  lead_cap INT,
  lead_budget TEXT,
  regions TEXT[] DEFAULT '{}',
  cities TEXT[] DEFAULT '{}',
  social_media TEXT,
  duration_start DATE,
  duration_end DATE,
  assured_bookings INT,
  avg_revenue_target NUMERIC(12,2),
  checklist1_complete BOOLEAN NOT NULL DEFAULT false,
  checklist2_complete BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales.training (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL UNIQUE REFERENCES sales.pipeline(id) ON DELETE CASCADE,
  profile_link TEXT,
  step_lead_unlock BOOLEAN NOT NULL DEFAULT false,
  step_lead_budget BOOLEAN NOT NULL DEFAULT false,
  step_lead_reversal BOOLEAN NOT NULL DEFAULT false,
  step_role_of_rm BOOLEAN NOT NULL DEFAULT false,
  step_rm_contact BOOLEAN NOT NULL DEFAULT false,
  step_lead_views BOOLEAN NOT NULL DEFAULT false,
  complete BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales.activation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL UNIQUE REFERENCES sales.pipeline(id) ON DELETE CASCADE,
  profile_link_verified BOOLEAN NOT NULL DEFAULT false,
  invoice_generated BOOLEAN NOT NULL DEFAULT false,
  invoice_number TEXT,
  invoice_generated_at TIMESTAMPTZ,
  contract_generated BOOLEAN NOT NULL DEFAULT false,
  contract_generated_at TIMESTAMPTZ,
  contract_url TEXT,
  contract_uploaded_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  activated_by UUID REFERENCES rm.staff(id),
  sent_back_at TIMESTAMPTZ,
  sent_back_note TEXT
);

CREATE TABLE IF NOT EXISTS sales.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id UUID NOT NULL REFERENCES rm.staff(id),
  pipeline_id UUID REFERENCES sales.pipeline(id) ON DELETE SET NULL,
  callyzer_call_id TEXT UNIQUE,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  duration_sec INT,
  called_at TIMESTAMPTZ,
  outcome TEXT,
  recording_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales.comms_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES sales.pipeline(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  description TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES rm.staff(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales.targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES rm.staff(id),
  month CHAR(7) NOT NULL,
  target_revenue NUMERIC(14,2),
  target_potential_calls INT,
  target_potential_sold INT,
  target_existing_calls INT,
  target_existing_sold INT,
  plan_targets JSONB,
  min_calls_per_day INT,
  min_talk_time_min_per_day INT,
  set_by UUID REFERENCES rm.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, month)
);

CREATE TABLE IF NOT EXISTS sales.ai_persona (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tone_style TEXT,
  core_pitch TEXT,
  value_props JSONB,
  objections JSONB,
  plan_differentiators JSONB,
  updated_by UUID REFERENCES rm.staff(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sales.ai_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  content_text TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES rm.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_pipeline_assigned_to ON sales.pipeline(assigned_to);
CREATE INDEX IF NOT EXISTS idx_sales_pipeline_mua_id ON sales.pipeline(mua_id);
CREATE INDEX IF NOT EXISTS idx_sales_pipeline_stage ON sales.pipeline(stage);
CREATE INDEX IF NOT EXISTS idx_sales_call_logs_pipeline_id ON sales.call_logs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_sales_comms_log_pipeline_id ON sales.comms_log(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_rm_muas_status ON rm.muas(status);
CREATE INDEX IF NOT EXISTS idx_rm_muas_team_id ON rm.muas(team_id);

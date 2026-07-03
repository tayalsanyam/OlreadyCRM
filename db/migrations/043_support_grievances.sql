-- Grievance Centre Phase 1: care_agent role, support schema, care comm types

ALTER TYPE rm.user_role ADD VALUE IF NOT EXISTS 'care_agent';

ALTER TYPE rm.comm_entry_type ADD VALUE IF NOT EXISTS 'care_ticket_created';
ALTER TYPE rm.comm_entry_type ADD VALUE IF NOT EXISTS 'care_email_sent';
ALTER TYPE rm.comm_entry_type ADD VALUE IF NOT EXISTS 'care_callback_logged';
ALTER TYPE rm.comm_entry_type ADD VALUE IF NOT EXISTS 'care_task_completed';
ALTER TYPE rm.comm_entry_type ADD VALUE IF NOT EXISTS 'care_whatsapp_logged';
ALTER TYPE rm.comm_entry_type ADD VALUE IF NOT EXISTS 'care_escalation';

CREATE SCHEMA IF NOT EXISTS support;

CREATE TYPE support.ticket_status AS ENUM (
  'open',
  'in_investigation',
  'pending_compilation',
  'pending_approval',
  'revision_requested',
  'approved',
  'closed'
);

CREATE TYPE support.ticket_urgency AS ENUM ('high', 'medium', 'low');

CREATE TYPE support.task_priority AS ENUM ('critical', 'high', 'normal', 'low');

CREATE TYPE support.care_task_type AS ENUM (
  'call_back',
  'gather_data',
  'verify_lead',
  'attach_proof',
  'attach_ledger',
  'attach_contract',
  'rm_input',
  'sales_input',
  'rm_mua_resolution',
  'draft_response',
  'admin_review',
  'send_email'
);

CREATE TYPE support.care_task_status AS ENUM ('pending', 'in_progress', 'done', 'cancelled');

CREATE TYPE support.ticket_source AS ENUM (
  'public_form',
  'manual',
  'feedback_intake',
  'email'
);

CREATE TYPE support.raised_by_type AS ENUM ('mua', 'bride', 'other');

CREATE TYPE support.email_response_status AS ENUM (
  'draft',
  'pending_approval',
  'approved',
  'revision_requested',
  'sent'
);

CREATE TABLE IF NOT EXISTS support.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE,
  mua_id UUID REFERENCES rm.muas(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES rm.bride_leads(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'other',
  subcategory TEXT,
  status support.ticket_status NOT NULL DEFAULT 'open',
  urgency support.ticket_urgency NOT NULL DEFAULT 'medium',
  source support.ticket_source NOT NULL DEFAULT 'manual',
  raised_by_type support.raised_by_type NOT NULL DEFAULT 'mua',
  raised_by_name TEXT,
  raised_by_phone TEXT,
  raised_by_email TEXT,
  complaint_text TEXT NOT NULL,
  assigned_to UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  assigned_admin_id UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  created_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  escalation_level SMALLINT NOT NULL DEFAULT 1 CHECK (escalation_level BETWEEN 1 AND 3),
  escalated_at TIMESTAMPTZ,
  escalated_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  escalation_reason TEXT,
  sla_due_at TIMESTAMPTZ,
  sla_breached BOOLEAN NOT NULL DEFAULT false,
  flags TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  ai_triage JSONB,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support.tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_mua ON support.tickets(mua_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_urgency ON support.tickets(urgency, sla_due_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON support.tickets(assigned_to, status);

CREATE TABLE IF NOT EXISTS support.ticket_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support.tickets(id) ON DELETE CASCADE,
  display_id TEXT NOT NULL,
  task_type support.care_task_type NOT NULL,
  status support.care_task_status NOT NULL DEFAULT 'pending',
  priority support.task_priority NOT NULL DEFAULT 'normal',
  assigned_to UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  assigned_role rm.user_role,
  title TEXT NOT NULL,
  description TEXT,
  task_payload JSONB NOT NULL DEFAULT '{}',
  requires_admin_approval BOOLEAN NOT NULL DEFAULT false,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  created_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_tasks_assignee
  ON support.ticket_tasks(assigned_to, status, due_at);
CREATE INDEX IF NOT EXISTS idx_support_ticket_tasks_ticket
  ON support.ticket_tasks(ticket_id, status);

CREATE TABLE IF NOT EXISTS support.ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support.tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT true,
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  ai_mode TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_comments_ticket
  ON support.ticket_comments(ticket_id, created_at DESC);

CREATE TABLE IF NOT EXISTS support.ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support.tickets(id) ON DELETE CASCADE,
  task_id UUID REFERENCES support.ticket_tasks(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  attachment_category TEXT NOT NULL DEFAULT 'general',
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'mua_visible')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support.ticket_ai_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support.tickets(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  prompt_summary TEXT,
  response TEXT NOT NULL,
  model TEXT,
  created_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support.ticket_email_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support.tickets(id) ON DELETE CASCADE,
  template_id UUID,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  to_email TEXT NOT NULL,
  approval_tier SMALLINT NOT NULL DEFAULT 0 CHECK (approval_tier BETWEEN 0 AND 3),
  status support.email_response_status NOT NULL DEFAULT 'draft',
  approved_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  sent_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  resend_message_id TEXT,
  created_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support.ticket_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support.tickets(id) ON DELETE CASCADE,
  from_status support.ticket_status,
  to_status support.ticket_status NOT NULL,
  changed_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support.ticket_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support.tickets(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES rm.staff(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support.ticket_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support.tickets(id) ON DELETE CASCADE,
  from_level SMALLINT NOT NULL,
  to_level SMALLINT NOT NULL,
  reason TEXT,
  escalated_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support.lead_reversal_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE REFERENCES support.tickets(id) ON DELETE CASCADE,
  leads_requested INT NOT NULL DEFAULT 0,
  leads_approved INT,
  decision TEXT CHECK (decision IS NULL OR decision IN ('approved', 'rejected', 'partial')),
  decision_reason TEXT,
  reviewed_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support.ticket_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT,
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  approval_tier SMALLINT NOT NULL DEFAULT 0 CHECK (approval_tier BETWEEN 0 AND 3),
  requires_admin_approval BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support.category_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL UNIQUE,
  default_urgency support.ticket_urgency NOT NULL DEFAULT 'medium',
  default_approval_tier SMALLINT NOT NULL DEFAULT 1,
  requires_ledger BOOLEAN NOT NULL DEFAULT false,
  sla_hours INT NOT NULL DEFAULT 48,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support.policy_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT,
  content_text TEXT NOT NULL,
  source_filename TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  uploaded_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support.ticket_lead_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support.tickets(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES rm.bride_leads(id) ON DELETE SET NULL,
  lead_name TEXT,
  lead_phone TEXT,
  match_confidence NUMERIC(4,3),
  match_flags TEXT[] NOT NULL DEFAULT '{}',
  confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support.sla_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  high_hours INT NOT NULL DEFAULT 24,
  medium_hours INT NOT NULL DEFAULT 48,
  low_hours INT NOT NULL DEFAULT 72,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO support.sla_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS support.lead_usage_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support.tickets(id) ON DELETE CASCADE,
  mua_id UUID REFERENCES rm.muas(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('excel', 'paste')),
  file_name TEXT,
  raw_content TEXT,
  uploaded_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support.lead_usage_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES support.lead_usage_uploads(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES support.tickets(id) ON DELETE CASCADE,
  mua_id UUID REFERENCES rm.muas(id) ON DELETE SET NULL,
  lead_name TEXT NOT NULL,
  lead_phone TEXT NOT NULL,
  matched_lead_id UUID REFERENCES rm.bride_leads(id) ON DELETE SET NULL,
  match_confidence NUMERIC(4,3),
  match_flags TEXT[] NOT NULL DEFAULT '{}',
  row_number INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support.email_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('resend', 'gmail')),
  config_json JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support.ticket_email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support.tickets(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_thread_id TEXT,
  subject TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS support.ticket_number_seq START 1;

CREATE OR REPLACE FUNCTION support.generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := 'T-' || TO_CHAR(NOW(), 'YYYYMM') || '-' ||
      LPAD(nextval('support.ticket_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_ticket_number ON support.tickets;
CREATE TRIGGER trg_support_ticket_number
  BEFORE INSERT ON support.tickets
  FOR EACH ROW EXECUTE FUNCTION support.generate_ticket_number();

INSERT INTO support.category_config (category, default_urgency, default_approval_tier, requires_ledger, sla_hours)
VALUES
  ('lead_reversal', 'medium', 2, true, 48),
  ('lead_quality', 'medium', 1, false, 48),
  ('did_not_get_business', 'medium', 2, true, 48),
  ('plan_extension', 'medium', 2, true, 48),
  ('invoice_contract', 'medium', 1, false, 48),
  ('rm_relationship', 'high', 2, false, 24),
  ('sales_promise', 'high', 2, false, 24),
  ('profile_query', 'low', 0, false, 72),
  ('other', 'medium', 1, false, 48)
ON CONFLICT (category) DO NOTHING;

INSERT INTO support.ticket_templates (category, name, subject_template, body_template, approval_tier, requires_admin_approval)
SELECT * FROM (VALUES
  ('other', 'Acknowledgement', 'We received your concern — {{ticket_number}}',
   E'Dear {{mua_name}},\n\nThank you for reaching out to Team Olready. We have received your concern (reference {{ticket_number}}) and our care team is reviewing it.\n\nWe will get back to you shortly.\n\nWarm regards,\nTeam Olready', 0, false),
  ('other', 'Request more information', 'Additional information needed — {{ticket_number}}',
   E'Dear {{mua_name}},\n\nTo proceed with your concern ({{ticket_number}}), we need a few more details from you.\n\n{{next_steps}}\n\nThank you,\nTeam Olready', 0, false),
  ('other', 'Request proof', 'Proof requested — {{ticket_number}}',
   E'Dear {{mua_name}},\n\nFor ticket {{ticket_number}}, please share the requested proof/screenshots so we can complete our review.\n\nThank you,\nTeam Olready', 0, false),
  ('lead_reversal', 'Reversal under review', 'Lead reversal under review — {{ticket_number}}',
   E'Dear {{mua_name}},\n\nYour lead reversal request ({{ticket_number}}) is under review. We will share our decision after verifying records.\n\nTeam Olready', 1, false),
  ('lead_reversal', 'Reversal approved', 'Lead reversal decision — {{ticket_number}}',
   E'Dear {{mua_name}},\n\nFollowing our review of ticket {{ticket_number}}, {{resolution}}\n\n{{next_steps}}\n\nTeam Olready', 2, true),
  ('lead_reversal', 'Reversal rejected', 'Lead reversal decision — {{ticket_number}}',
   E'Dear {{mua_name}},\n\nFollowing our review of ticket {{ticket_number}}, {{resolution}}\n\n{{next_steps}}\n\nTeam Olready', 2, true)
) AS v(category, name, subject_template, body_template, approval_tier, requires_admin_approval)
WHERE NOT EXISTS (SELECT 1 FROM support.ticket_templates LIMIT 1);

INSERT INTO support.email_integrations (provider, config_json, active)
SELECT 'resend', '{"from": "care@olready.in"}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM support.email_integrations WHERE provider = 'resend');

-- Prospect inquiries from public /support (chat intake + interest form)

CREATE TABLE IF NOT EXISTS support.support_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES support.public_chat_sessions(id) ON DELETE SET NULL,
  display_id TEXT NOT NULL UNIQUE,
  visitor_kind TEXT NOT NULL CHECK (visitor_kind IN ('mua', 'bride')),
  segment TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  email TEXT,
  city TEXT,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'chat_intake'
    CHECK (source IN ('chat_intake', 'interest_form')),
  status support.care_task_status NOT NULL DEFAULT 'pending',
  assigned_to UUID REFERENCES rm.staff(id),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES rm.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_inquiries_status
  ON support.support_inquiries(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_inquiries_phone
  ON support.support_inquiries(phone_normalized);

CREATE INDEX IF NOT EXISTS idx_support_inquiries_session
  ON support.support_inquiries(session_id);

ALTER TABLE support.public_chat_sessions
  ADD COLUMN IF NOT EXISTS inquiry_id UUID REFERENCES support.support_inquiries(id);

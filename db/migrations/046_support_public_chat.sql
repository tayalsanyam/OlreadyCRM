-- Public support AI chat sessions (intake + message log)

CREATE TABLE IF NOT EXISTS support.public_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  visitor_kind TEXT NOT NULL CHECK (visitor_kind IN ('mua', 'bride')),
  segment TEXT NOT NULL,
  mua_id UUID REFERENCES rm.muas(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES rm.bride_leads(id) ON DELETE SET NULL,
  context_snapshot JSONB NOT NULL DEFAULT '{}',
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_public_chat_sessions_phone
  ON support.public_chat_sessions(phone_normalized, created_at DESC);

CREATE TABLE IF NOT EXISTS support.public_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES support.public_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_public_chat_messages_session
  ON support.public_chat_messages(session_id, created_at ASC);

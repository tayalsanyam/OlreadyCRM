-- Email revision notes, ticket updates (follow-up issues), comms index

ALTER TABLE support.ticket_email_responses
  ADD COLUMN IF NOT EXISTS admin_revision_note TEXT;

CREATE TABLE IF NOT EXISTS support.ticket_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support.tickets(id) ON DELETE CASCADE,
  update_text TEXT NOT NULL,
  categories TEXT[] NOT NULL DEFAULT '{}',
  lead_ids UUID[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'internal'
    CHECK (source IN ('internal', 'public_form')),
  created_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_updates_ticket
  ON support.ticket_updates(ticket_id, created_at DESC);

-- Manual care / party correspondence on tickets (timeline logging)
ALTER TABLE support.ticket_comments
  ADD COLUMN IF NOT EXISTS correspondence_kind TEXT
    CHECK (
      correspondence_kind IS NULL
      OR correspondence_kind IN ('care_reply', 'party_reply', 'internal_note')
    ),
  ADD COLUMN IF NOT EXISTS channel TEXT
    CHECK (
      channel IS NULL
      OR channel IN ('email', 'whatsapp', 'phone', 'in_person', 'other')
    );

CREATE INDEX IF NOT EXISTS idx_support_ticket_comments_correspondence
  ON support.ticket_comments(ticket_id, correspondence_kind, created_at DESC);

ALTER TABLE support.ticket_email_responses
  ADD COLUMN IF NOT EXISTS attachment_ids UUID[] NOT NULL DEFAULT '{}';

-- Approved email snapshots + superseded status for re-approval workflow

ALTER TYPE support.email_response_status ADD VALUE IF NOT EXISTS 'superseded';

ALTER TABLE support.ticket_email_responses
  ADD COLUMN IF NOT EXISTS approved_subject TEXT,
  ADD COLUMN IF NOT EXISTS approved_body_html TEXT,
  ADD COLUMN IF NOT EXISTS approved_to_email TEXT;

-- Backfill snapshots for already-approved drafts awaiting send
UPDATE support.ticket_email_responses
SET
  approved_subject = subject,
  approved_body_html = body_html,
  approved_to_email = to_email,
  updated_at = NOW()
WHERE status = 'approved'
  AND approved_body_html IS NULL;

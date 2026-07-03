ALTER TABLE support.ticket_email_responses
  ADD COLUMN IF NOT EXISTS send_channel TEXT
  CHECK (send_channel IS NULL OR send_channel IN ('resend', 'gmail'));

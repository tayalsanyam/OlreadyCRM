-- Uploader verification: log connect attempts before NI / archive on pending leads

ALTER TABLE rm.bride_leads
  ADD COLUMN IF NOT EXISTS verification_connect_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_verification_connect_at DATE;

CREATE TABLE IF NOT EXISTS rm.lead_verification_connect_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES rm.bride_leads(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES rm.staff(id),
  attempt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_verification_connect_attempts_lead
  ON rm.lead_verification_connect_attempts(lead_id, attempt_date DESC);

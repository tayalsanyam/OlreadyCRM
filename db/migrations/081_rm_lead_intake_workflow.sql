-- RM lead intake: confirmation state + attempt log

CREATE TYPE rm.lead_confirmation_status AS ENUM ('pending', 'confirmed');

ALTER TABLE rm.bride_leads
  ADD COLUMN IF NOT EXISTS confirmation_status rm.lead_confirmation_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS confirmation_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_confirmation_attempt_at DATE,
  ADD COLUMN IF NOT EXISTS requirements_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_progress_follow_up_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS rm.lead_confirmation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES rm.bride_leads(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES rm.staff(id),
  attempt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_confirmation_attempts_lead
  ON rm.lead_confirmation_attempts(lead_id, attempt_date DESC);

UPDATE rm.bride_leads bl
SET
  confirmation_status = 'confirmed',
  requirements_confirmed_at = COALESCE(bl.requirements_confirmed_at, bl.updated_at, NOW())
WHERE bl.status IN ('assigned', 'commission_rm')
  AND (
    SELECT COUNT(DISTINCT mp.mua_id)::int
    FROM rm.mua_pushes mp
    WHERE mp.lead_id = bl.id
      AND mp.status NOT IN ('closed', 'booked')
  ) >= 4;

-- Intake columns are on bride_leads; recreate leads_full in 082 so the view exposes them.

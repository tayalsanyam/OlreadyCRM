-- Feedback RM role, extended lead_feedback, referrals, follow-up tasks

ALTER TYPE rm.user_role ADD VALUE IF NOT EXISTS 'feedback_rm';

ALTER TYPE rm.task_type ADD VALUE IF NOT EXISTS 'feedback_follow_up';

ALTER TABLE rm.lead_feedback
  ADD COLUMN IF NOT EXISTS service_sentiment TEXT CHECK (
    service_sentiment IS NULL OR service_sentiment IN ('positive', 'negative', 'mixed')
  ),
  ADD COLUMN IF NOT EXISTS negative_reasons TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS negative_reason_other TEXT,
  ADD COLUMN IF NOT EXISTS recommendations_note TEXT,
  ADD COLUMN IF NOT EXISTS referrals_note TEXT,
  ADD COLUMN IF NOT EXISTS engage_again TEXT CHECK (
    engage_again IS NULL OR engage_again IN ('yes', 'no', 'maybe')
  ),
  ADD COLUMN IF NOT EXISTS engage_again_note TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_requested BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_at DATE,
  ADD COLUMN IF NOT EXISTS follow_up_note TEXT;

CREATE TABLE IF NOT EXISTS rm.feedback_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_lead_id UUID NOT NULL REFERENCES rm.bride_leads(id) ON DELETE CASCADE,
  feedback_id UUID REFERENCES rm.lead_feedback(id) ON DELETE SET NULL,
  referral_name TEXT NOT NULL,
  referral_phone TEXT NOT NULL,
  captured_by UUID NOT NULL REFERENCES rm.staff(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'picked_up', 'converted', 'dismissed')
  ),
  converted_lead_id UUID REFERENCES rm.bride_leads(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_referrals_status
  ON rm.feedback_referrals(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_referrals_source
  ON rm.feedback_referrals(source_lead_id);

ALTER TABLE rm.mua_prospects
  ADD COLUMN IF NOT EXISTS feedback_id UUID REFERENCES rm.lead_feedback(id) ON DELETE SET NULL;

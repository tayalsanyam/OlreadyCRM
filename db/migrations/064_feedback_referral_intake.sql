-- Referral phone follow-up tasks (feedback RM — not upload queue without phone)

ALTER TYPE rm.task_type ADD VALUE IF NOT EXISTS 'feedback_referral_follow_up';

CREATE TABLE IF NOT EXISTS rm.feedback_referral_intake (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES rm.lead_feedback(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES rm.bride_leads(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES rm.staff(id),
  note TEXT NOT NULL,
  task_id UUID REFERENCES rm.rm_tasks(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'collected', 'dismissed')),
  collected_name TEXT,
  collected_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_referral_intake_task
  ON rm.feedback_referral_intake(task_id);

CREATE INDEX IF NOT EXISTS idx_feedback_referral_intake_staff
  ON rm.feedback_referral_intake(staff_id, status, created_at DESC);

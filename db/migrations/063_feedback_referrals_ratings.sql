-- Note-only bride referrals + Olready / MUA satisfaction ratings on feedback

ALTER TABLE rm.feedback_referrals
  ALTER COLUMN referral_phone DROP NOT NULL;

ALTER TABLE rm.feedback_referrals
  ADD COLUMN IF NOT EXISTS capture_type TEXT NOT NULL DEFAULT 'structured'
    CHECK (capture_type IN ('structured', 'note'));

ALTER TABLE rm.lead_feedback
  ADD COLUMN IF NOT EXISTS olready_rating SMALLINT
    CHECK (olready_rating IS NULL OR (olready_rating >= 1 AND olready_rating <= 5)),
  ADD COLUMN IF NOT EXISTS mua_rating SMALLINT
    CHECK (mua_rating IS NULL OR (mua_rating >= 1 AND mua_rating <= 5));

-- Unverified uploader leads were auto-expired when ceremony dates were missing.
-- Restore them to the pending verification queue.

UPDATE rm.bride_leads
SET
  status = 'pending_verification',
  expired_at = NULL,
  updated_at = NOW()
WHERE verified = false
  AND verified_at IS NULL
  AND status = 'expired';

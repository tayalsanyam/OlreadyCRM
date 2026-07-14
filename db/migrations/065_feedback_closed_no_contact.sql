-- Allow final "closed no contact" after repeated unreachable attempts.

ALTER TABLE rm.lead_feedback
  DROP CONSTRAINT IF EXISTS lead_feedback_connection_status_check;

ALTER TABLE rm.lead_feedback
  ADD CONSTRAINT lead_feedback_connection_status_check
  CHECK (
    connection_status IN (
      'connected',
      'not_answered',
      'not_interested',
      'closed_no_contact'
    )
  );

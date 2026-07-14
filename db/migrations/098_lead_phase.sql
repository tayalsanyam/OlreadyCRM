-- Canonical lifecycle phase for leads (single source for queues & reporting)
ALTER TABLE bride_leads
  ADD COLUMN IF NOT EXISTS lead_phase TEXT;

ALTER TABLE bride_leads DROP CONSTRAINT IF EXISTS bride_leads_lead_phase_check;
ALTER TABLE bride_leads ADD CONSTRAINT bride_leads_lead_phase_check
  CHECK (
    lead_phase IS NULL
    OR lead_phase IN (
      'pending_verification',
      'verified_pool',
      'assigned',
      'commission',
      'booked',
      'uploader_review',
      'closed',
      'expired'
    )
  );

CREATE INDEX IF NOT EXISTS idx_bride_leads_lead_phase ON bride_leads(lead_phase);

COMMENT ON COLUMN bride_leads.lead_phase IS
  'Lifecycle phase: verified_pool (incl portal-tagged unassigned), uploader_review (RM/Commission NA/NI awaiting uploader), closed, expired, etc.';

-- Backfill (mirrors lib/lead-phase.ts SQL_COMPUTE_LEAD_PHASE)
UPDATE bride_leads bl
SET lead_phase = CASE
  WHEN bl.status = 'expired' THEN 'expired'
  WHEN bl.status = 'pending_verification' THEN 'pending_verification'
  WHEN bl.status = 'booked' THEN 'booked'
  WHEN bl.status = 'assigned' THEN 'assigned'
  WHEN bl.status = 'commission_rm' THEN 'commission'
  WHEN bl.status = 'verified' THEN 'verified_pool'
  WHEN bl.status = 'missed' THEN 'closed'
  WHEN bl.status = 'archived'
    AND bl.uploader_confirmation IS NULL
    AND (
      (
        bl.hostile_note IS NOT NULL
        AND TRIM(bl.hostile_note) <> ''
      )
      OR (
        NOT (
          bl.verified = true
          AND NOT (
            bl.handover_reason ILIKE '%not interested%'
            OR bl.exit_marked_by_role IN ('regional_rm', 'commission_rm')
            OR EXISTS (
              SELECT 1 FROM comms c
              WHERE c.lead_id = bl.id
                AND (
                  c.description ILIKE '%not interested% — archived by%'
                  OR c.description ILIKE '%Not interested in Olready services%'
                )
            )
          )
          AND (
            bl.handover_reason ILIKE '%deactivated%'
            OR EXISTS (
              SELECT 1 FROM comms c
              WHERE c.lead_id = bl.id
                AND c.description ILIKE 'Lead deactivated:%'
              LIMIT 1
            )
          )
        )
        AND (
          bl.handover_reason ILIKE '%not interested%'
          OR bl.exit_marked_by_role IN ('regional_rm', 'commission_rm')
          OR EXISTS (
            SELECT 1 FROM comms c
            WHERE c.lead_id = bl.id
              AND (
                c.description ILIKE '%not interested% — archived by%'
                OR c.description ILIKE '%Not interested in Olready services%'
              )
          )
        )
      )
    )
    THEN 'uploader_review'
  WHEN bl.status = 'archived' THEN 'closed'
  ELSE 'closed'
END
WHERE lead_phase IS NULL;

UPDATE bride_leads SET lead_phase = 'verified_pool' WHERE lead_phase IS NULL AND status = 'verified';
UPDATE bride_leads SET lead_phase = 'closed' WHERE lead_phase IS NULL;

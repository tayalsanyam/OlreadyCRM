-- Recompute lead_phase for every lead (fixes stale/null phases after partial backfill)
UPDATE rm.bride_leads bl
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
              SELECT 1 FROM rm.comms c
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
              SELECT 1 FROM rm.comms c
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
            SELECT 1 FROM rm.comms c
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
END;

UPDATE rm.bride_leads SET lead_phase = 'verified_pool' WHERE lead_phase IS NULL AND status = 'verified';
UPDATE rm.bride_leads SET lead_phase = 'pending_verification' WHERE lead_phase IS NULL AND status = 'pending_verification';
UPDATE rm.bride_leads SET lead_phase = 'closed' WHERE lead_phase IS NULL;

ALTER TABLE rm.bride_leads ALTER COLUMN lead_phase SET NOT NULL;

COMMENT ON COLUMN rm.bride_leads.lead_phase IS
  'Lifecycle phase (NOT NULL, recomputed on every status change via refreshLeadPhase).';

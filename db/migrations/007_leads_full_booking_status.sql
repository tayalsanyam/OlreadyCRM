-- Event booking counts for accurate status display + backfill stale lead status
DROP VIEW IF EXISTS rm.leads_full;

CREATE VIEW rm.leads_full AS
SELECT
  bl.*,
  rm.compute_urgency_band(bl.event_date) AS urgency_band,
  (bl.event_date - CURRENT_DATE) AS days_to_event,
  CASE
    WHEN bl.assignment_date IS NULL THEN NULL
    ELSE GREATEST(0, (SELECT assignment_window_days FROM rm.sla_config WHERE id = 1) - (CURRENT_DATE - bl.assignment_date))
  END AS assignment_days_remaining,
  CASE
    WHEN bl.assignment_date IS NULL THEN NULL
    ELSE (CURRENT_DATE - bl.assignment_date)
  END AS days_since_assignment,
  s.name AS assigned_rm_name,
  (SELECT COUNT(*)::int FROM rm.mua_pushes mp WHERE mp.lead_id = bl.id AND mp.status NOT IN ('closed', 'booked')) AS active_pushes_count,
  (SELECT COUNT(DISTINCT mp.mua_id)::int FROM rm.mua_pushes mp WHERE mp.lead_id = bl.id) AS muas_offered_count,
  (SELECT COUNT(*)::int FROM rm.lead_events le WHERE le.lead_id = bl.id AND le.status != 'not_needed') AS event_count,
  (SELECT COUNT(*)::int FROM rm.lead_events le WHERE le.lead_id = bl.id AND le.status = 'booked') AS booked_event_count,
  (SELECT COUNT(*)::int FROM rm.lead_events le WHERE le.lead_id = bl.id AND le.status = 'open') AS open_event_count,
  (
    SELECT string_agg(le.ceremony_type, ', ' ORDER BY le.event_date NULLS LAST, le.ceremony_type)
    FROM rm.lead_events le
    WHERE le.lead_id = bl.id AND le.status != 'not_needed'
  ) AS event_labels,
  (SELECT MAX(c.created_at) FROM rm.comms c WHERE c.lead_id = bl.id) AS last_activity_at
FROM rm.bride_leads bl
LEFT JOIN rm.staff s ON s.id = bl.assigned_rm_id;

UPDATE rm.bride_leads bl
SET status = 'booked', updated_at = NOW()
WHERE bl.status = 'assigned'
  AND NOT EXISTS (
    SELECT 1 FROM rm.lead_events le
    WHERE le.lead_id = bl.id AND le.status NOT IN ('booked', 'not_needed')
  )
  AND EXISTS (
    SELECT 1 FROM rm.lead_events le
    WHERE le.lead_id = bl.id AND le.status = 'booked'
  );

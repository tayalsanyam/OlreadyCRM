-- Recreate leads_full so new bride_leads columns (commission_*) are visible.
-- PostgreSQL expands bl.* at view creation time; ALTER TABLE does not update the view.
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
  (
    SELECT string_agg(names.name, ', ' ORDER BY names.name)
    FROM (
      SELECT DISTINCT m.name
      FROM rm.mua_pushes mp
      JOIN rm.muas m ON m.id = mp.mua_id
      WHERE mp.lead_id = bl.id
    ) names
  ) AS muas_offered_names,
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

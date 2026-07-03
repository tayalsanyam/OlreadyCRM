-- leads_full was created with a fixed column list; recreate so new bride_leads columns (portal_*) are visible.

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
  (SELECT COUNT(*)::int FROM rm.lead_events le WHERE le.lead_id = bl.id) AS event_count,
  (SELECT MAX(c.created_at) FROM rm.comms c WHERE c.lead_id = bl.id) AS last_activity_at
FROM rm.bride_leads bl
LEFT JOIN rm.staff s ON s.id = bl.assigned_rm_id;

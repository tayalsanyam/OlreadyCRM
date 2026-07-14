-- Speed up queue list/count queries (status + region + event_date filters).
CREATE INDEX IF NOT EXISTS idx_bride_leads_status_region_event
  ON rm.bride_leads (status, region, event_date);

CREATE INDEX IF NOT EXISTS idx_bride_leads_assigned_status
  ON rm.bride_leads (assigned_rm_id, status, event_date);

CREATE INDEX IF NOT EXISTS idx_mua_pushes_lead_id
  ON rm.mua_pushes (lead_id);

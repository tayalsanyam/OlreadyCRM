-- Optional ceremony on connected feedback (multi-event leads)
ALTER TABLE rm.lead_feedback
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES rm.lead_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lead_feedback_event
  ON rm.lead_feedback(event_id)
  WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_feedback_connected_event_mua
  ON rm.lead_feedback(lead_id, event_id, olready_mua_id)
  WHERE connection_status = 'connected'
    AND mua_type = 'olready'
    AND olready_mua_id IS NOT NULL
    AND event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_feedback_connected_legacy_mua
  ON rm.lead_feedback(lead_id, olready_mua_id)
  WHERE connection_status = 'connected'
    AND mua_type = 'olready'
    AND olready_mua_id IS NOT NULL
    AND event_id IS NULL;

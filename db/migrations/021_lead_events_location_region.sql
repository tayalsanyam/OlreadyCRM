-- Per-ceremony venue and region (lead.region remains routing / assignment).

ALTER TABLE rm.lead_events
  ADD COLUMN IF NOT EXISTS event_location TEXT,
  ADD COLUMN IF NOT EXISTS region rm.region;

UPDATE rm.lead_events le
SET
  event_location = COALESCE(NULLIF(TRIM(le.event_location), ''), bl.event_location),
  region = COALESCE(le.region, bl.region)
FROM rm.bride_leads bl
WHERE le.lead_id = bl.id
  AND (le.event_location IS NULL OR le.region IS NULL);

CREATE INDEX IF NOT EXISTS idx_lead_events_region ON rm.lead_events(region);

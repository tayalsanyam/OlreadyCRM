-- Uploader intake may save city before region; verification sets region before routing.
ALTER TABLE rm.bride_leads
  ALTER COLUMN region DROP NOT NULL;

COMMENT ON COLUMN rm.bride_leads.region IS
  'RM routing region. Nullable on pending_verification until verify resolves from city/ceremony locations.';

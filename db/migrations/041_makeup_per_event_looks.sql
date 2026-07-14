-- Per-ceremony makeup looks when same_look_all_events is false
ALTER TABLE bride_makeup_look_profiles
  ADD COLUMN IF NOT EXISTS per_event_looks JSONB NOT NULL DEFAULT '{}'::jsonb;

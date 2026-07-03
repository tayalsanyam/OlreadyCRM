-- Per-phone Callyzer pull watermark (shared numbers sync once for all staff on that line).

CREATE TABLE IF NOT EXISTS rm.callyzer_sync_state (
  emp_phone TEXT PRIMARY KEY,
  last_synced_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_callyzer_sync_state_last_synced
  ON rm.callyzer_sync_state (last_synced_at DESC);

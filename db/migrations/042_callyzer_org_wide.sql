-- Org-wide Callyzer call tracking (all staff roles with callyzer_number)

ALTER TYPE rm.comm_entry_type ADD VALUE IF NOT EXISTS 'callyzer_synced';

CREATE TABLE IF NOT EXISTS rm.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES rm.staff(id),
  callyzer_call_id TEXT NOT NULL UNIQUE,
  client_phone TEXT NOT NULL,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  duration_sec INT NOT NULL DEFAULT 0,
  called_at TIMESTAMPTZ,
  outcome TEXT,
  recording_url TEXT,
  lead_id UUID REFERENCES rm.bride_leads(id) ON DELETE SET NULL,
  mua_id UUID REFERENCES rm.muas(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES sales.pipeline(id) ON DELETE SET NULL,
  contact_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (contact_type IN ('lead', 'mua', 'unknown')),
  source TEXT NOT NULL DEFAULT 'callyzer'
    CHECK (source IN ('callyzer', 'callyzer_webhook')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_staff_called
  ON rm.call_logs (staff_id, called_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_logs_lead_called
  ON rm.call_logs (lead_id, called_at DESC)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_mua_called
  ON rm.call_logs (mua_id, called_at DESC)
  WHERE mua_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_called_at
  ON rm.call_logs (called_at DESC);

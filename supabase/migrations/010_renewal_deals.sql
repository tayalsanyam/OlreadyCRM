-- Renewal/upgrade deals (tracked like leads in deal stage, activated on full payment)
CREATE TABLE IF NOT EXISTS renewal_deals (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  subscription_type TEXT NOT NULL DEFAULT 'renewal' CHECK (subscription_type IN ('renewal', 'upgrade')),
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'PARTLY_PAID', 'PAID')),
  connected_on DATE,
  next_follow_up DATE,
  committed_date DATE,
  original_price NUMERIC,
  discount NUMERIC DEFAULT 0,
  amount_paid NUMERIC DEFAULT 0,
  duration_months INTEGER,
  add_ons TEXT,
  ops_coordinator TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renewal_deals_lead_id ON renewal_deals (lead_id);
CREATE INDEX IF NOT EXISTS idx_renewal_deals_status ON renewal_deals (status);

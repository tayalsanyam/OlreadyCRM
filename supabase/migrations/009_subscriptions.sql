-- Subscriptions (plan activations: initial, renewal, upgrade)
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  bdm TEXT NOT NULL,
  subscription_type TEXT NOT NULL DEFAULT 'initial' CHECK (subscription_type IN ('initial', 'renewal', 'upgrade')),
  plan_name TEXT NOT NULL,
  plan_start_date DATE NOT NULL,
  plan_end_date DATE NOT NULL,
  leads_count INTEGER,
  duration_months INTEGER NOT NULL,
  price_paid NUMERIC NOT NULL DEFAULT 0,
  add_ons TEXT,
  business_generated TEXT,
  overall_experience TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add new columns if table existed with old schema
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS bdm TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS subscription_type TEXT DEFAULT 'initial';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS business_generated TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS overall_experience TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS duration_months INTEGER;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_end_date DATE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_start_date DATE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS leads_count INTEGER;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS price_paid NUMERIC DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS add_ons TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Cursor prompts batch: config, events, cities, bookings cancel, staff regions, expired, feedback

ALTER TABLE rm.sla_config
  ADD COLUMN IF NOT EXISTS budget_tier_ranges JSONB NOT NULL DEFAULT '{
    "tier1": "Under ₹50,000",
    "tier2": "₹50,000 – ₹1,00,000",
    "tier3": "₹1,00,000 – ₹3,00,000",
    "tier4": "Above ₹3,00,000"
  }'::jsonb;

ALTER TABLE rm.sla_config
  ADD COLUMN IF NOT EXISTS lead_sources JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE rm.lead_events
  ADD COLUMN IF NOT EXISTS description TEXT;

CREATE TABLE IF NOT EXISTS rm.city_regions (
  id SERIAL PRIMARY KEY,
  city TEXT NOT NULL UNIQUE,
  region rm.region NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE rm.bookings
  ADD COLUMN IF NOT EXISTS cancelled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

ALTER TABLE rm.staff
  ADD COLUMN IF NOT EXISTS regions rm.region[] NOT NULL DEFAULT '{}';

UPDATE rm.staff
SET regions = ARRAY[region]
WHERE region IS NOT NULL
  AND (regions IS NULL OR cardinality(regions) = 0);

ALTER TYPE rm.lead_status ADD VALUE IF NOT EXISTS 'expired';

ALTER TABLE rm.bride_leads
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

ALTER TYPE rm.task_type ADD VALUE IF NOT EXISTS 'collect_mua_prospect';

CREATE TABLE IF NOT EXISTS rm.lead_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES rm.bride_leads(id) ON DELETE CASCADE,
  mua_type TEXT NOT NULL CHECK (mua_type IN ('olready', 'non_olready')),
  olready_mua_id UUID REFERENCES rm.muas(id),
  non_olready_mua_name TEXT,
  valuable_options BOOLEAN,
  references_note TEXT,
  improvements_note TEXT,
  connection_status TEXT NOT NULL CHECK (
    connection_status IN ('connected', 'not_answered', 'not_interested')
  ),
  submitted_by UUID REFERENCES rm.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_feedback_lead ON rm.lead_feedback(lead_id);

CREATE TABLE IF NOT EXISTS rm.mua_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES rm.bride_leads(id) ON DELETE SET NULL,
  non_olready_mua_name TEXT NOT NULL,
  insta_id TEXT,
  phone TEXT,
  city TEXT,
  task_id UUID REFERENCES rm.rm_tasks(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'collected', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mua_prospects_lead ON rm.mua_prospects(lead_id);

-- SLA event date: latest ceremony date, else lead.event_date
CREATE OR REPLACE FUNCTION rm.lead_sla_event_date(p_lead_id UUID)
RETURNS DATE AS $$
  SELECT COALESCE(
    (
      SELECT MAX(le.event_date)
      FROM rm.lead_events le
      WHERE le.lead_id = p_lead_id
        AND le.status != 'not_needed'
        AND le.event_date IS NOT NULL
    ),
    (SELECT bl.event_date FROM rm.bride_leads bl WHERE bl.id = p_lead_id)
  );
$$ LANGUAGE sql STABLE;

-- Seed cities (idempotent)
INSERT INTO rm.city_regions (city, region) VALUES
  ('Delhi', 'north'), ('Noida', 'north'), ('Gurugram', 'north'), ('Gurgaon', 'north'),
  ('Ghaziabad', 'north'), ('Chandigarh', 'north'), ('Jaipur', 'north'), ('Lucknow', 'north'),
  ('Agra', 'north'), ('Varanasi', 'north'), ('Amritsar', 'north'), ('Ludhiana', 'north'),
  ('Dehradun', 'north'), ('Meerut', 'north'), ('Kanpur', 'north'),
  ('Mumbai', 'west'), ('Pune', 'west'), ('Ahmedabad', 'west'), ('Surat', 'west'),
  ('Nagpur', 'west'), ('Indore', 'west'), ('Bhopal', 'west'), ('Vadodara', 'west'),
  ('Rajkot', 'west'), ('Thane', 'west'), ('Nashik', 'west'), ('Aurangabad', 'west'),
  ('Bengaluru', 'south'), ('Bangalore', 'south'), ('Chennai', 'south'), ('Hyderabad', 'south'),
  ('Kochi', 'south'), ('Coimbatore', 'south'), ('Vizag', 'south'), ('Madurai', 'south'),
  ('Mysuru', 'south'), ('Thiruvananthapuram', 'south'), ('Vijayawada', 'south'),
  ('Tirupati', 'south'), ('Calicut', 'south'),
  ('Kolkata', 'east'), ('Bhubaneswar', 'east'), ('Guwahati', 'east'), ('Patna', 'east'),
  ('Ranchi', 'east'), ('Jamshedpur', 'east'), ('Cuttack', 'east'), ('Siliguri', 'east'),
  ('Agartala', 'east')
ON CONFLICT (city) DO NOTHING;

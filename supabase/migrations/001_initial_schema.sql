-- Olready CRM – Supabase schema
-- Run in Supabase SQL Editor or via supabase db push

-- Users (custom auth, not Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'team_leader', 'bdm')),
  assigned_bdm TEXT,
  team_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BDMs
CREATE TABLE IF NOT EXISTS bdms (
  id SERIAL PRIMARY KEY,
  bdm TEXT UNIQUE NOT NULL,
  target NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plans
CREATE TABLE IF NOT EXISTS plans (
  id SERIAL PRIMARY KEY,
  plan TEXT UNIQUE NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  team_id TEXT UNIQUE NOT NULL,
  team_name TEXT NOT NULL,
  bdm TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  insta_id TEXT,
  bdm TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNTOUCHED',
  source TEXT,
  remarks TEXT,
  connected_on DATE,
  next_follow_up DATE,
  committed_date DATE,
  original_price NUMERIC,
  discount NUMERIC DEFAULT 0,
  amount_paid NUMERIC DEFAULT 0,
  amount_balance NUMERIC DEFAULT 0,
  payment_status TEXT DEFAULT 'PENDING',
  payment_mode TEXT,
  if_part BOOLEAN DEFAULT FALSE,
  lost_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_modified TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone ON leads (phone) WHERE phone IS NOT NULL AND phone != '';

-- Activity
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time TEXT,
  action TEXT NOT NULL,
  "user" TEXT,
  notes TEXT,
  status TEXT,
  remarks TEXT,
  next_connect TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  due DATE NOT NULL,
  assignee TEXT NOT NULL,
  done BOOLEAN DEFAULT FALSE,
  lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BDM Log
CREATE TABLE IF NOT EXISTS bdm_log (
  id TEXT PRIMARY KEY,
  bdm TEXT NOT NULL,
  date DATE NOT NULL,
  total_calls INTEGER DEFAULT 0,
  connected_calls INTEGER DEFAULT 0,
  non_answered_calls INTEGER DEFAULT 0,
  talk_time INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: enable for all tables (service role bypasses)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bdms ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bdm_log ENABLE ROW LEVEL SECURITY;

-- Policies: drop if exists (idempotent for re-runs)
DROP POLICY IF EXISTS "Allow all users" ON users;
DROP POLICY IF EXISTS "Allow all bdms" ON bdms;
DROP POLICY IF EXISTS "Allow all plans" ON plans;
DROP POLICY IF EXISTS "Allow all teams" ON teams;
DROP POLICY IF EXISTS "Allow all leads" ON leads;
DROP POLICY IF EXISTS "Allow all activity" ON activity;
DROP POLICY IF EXISTS "Allow all tasks" ON tasks;
DROP POLICY IF EXISTS "Allow all bdm_log" ON bdm_log;

CREATE POLICY "Allow all users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all bdms" ON bdms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all plans" ON plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all teams" ON teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all leads" ON leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all activity" ON activity FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all bdm_log" ON bdm_log FOR ALL USING (true) WITH CHECK (true);

-- Trigger: update last_modified on leads
CREATE OR REPLACE FUNCTION update_leads_last_modified()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_modified = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_last_modified ON leads;
CREATE TRIGGER leads_last_modified
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_leads_last_modified();

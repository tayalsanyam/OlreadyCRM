-- Ops Coordinators (Admin config, like bdms)
CREATE TABLE IF NOT EXISTS ops_coordinators (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers (one per lead when first PAID)
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  ops_coordinator TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_lead_id ON customers (lead_id);

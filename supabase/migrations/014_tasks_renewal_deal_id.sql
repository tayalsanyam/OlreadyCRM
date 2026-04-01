-- Link tasks to renewal deals (for renewal follow-up tasks)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS renewal_deal_id TEXT REFERENCES renewal_deals(id) ON DELETE SET NULL;

-- Add ops_coordinator to subscriptions (per-plan, so each subscription can have its own)
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS ops_coordinator TEXT;

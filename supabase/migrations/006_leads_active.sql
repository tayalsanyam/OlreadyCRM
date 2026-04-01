-- Add active column to leads (default true for existing)
-- Inactive leads are hidden from default list; can be shown via filter
ALTER TABLE leads ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
UPDATE leads SET active = true WHERE active IS NULL;

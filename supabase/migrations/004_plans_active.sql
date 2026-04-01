-- Add active column to plans (default true for existing)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

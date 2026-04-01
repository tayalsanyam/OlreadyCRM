-- Add email to users for digest delivery
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

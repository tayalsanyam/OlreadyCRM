-- Migrate existing part-paid leads from CONFIRMED to PARTLY_PAID
-- Run in Supabase SQL Editor
UPDATE leads
SET status = 'PARTLY_PAID'
WHERE status = 'CONFIRMED'
  AND if_part = true
  AND (amount_balance > 0 OR (amount_balance IS NULL AND amount_paid > 0));

-- Add RENEWAL_REJECTED status and rejection_reason
ALTER TABLE renewal_deals DROP CONSTRAINT IF EXISTS renewal_deals_status_check;
ALTER TABLE renewal_deals ADD CONSTRAINT renewal_deals_status_check
  CHECK (status IN ('RENEWAL_FOLLOW_UP', 'CONFIRMED', 'PARTLY_PAID', 'PAID', 'RENEWAL_REJECTED'));
ALTER TABLE renewal_deals ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

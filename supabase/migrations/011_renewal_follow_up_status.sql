-- Add RENEWAL_FOLLOW_UP status, default new deals to it
ALTER TABLE renewal_deals DROP CONSTRAINT IF EXISTS renewal_deals_status_check;
ALTER TABLE renewal_deals ADD CONSTRAINT renewal_deals_status_check
  CHECK (status IN ('RENEWAL_FOLLOW_UP', 'CONFIRMED', 'PARTLY_PAID', 'PAID'));
ALTER TABLE renewal_deals ALTER COLUMN status SET DEFAULT 'RENEWAL_FOLLOW_UP';

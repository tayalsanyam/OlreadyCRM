ALTER TABLE rm.bookings
  ADD COLUMN IF NOT EXISTS commission_payment_mode TEXT;

ALTER TABLE rm.bookings DROP CONSTRAINT IF EXISTS bookings_commission_payment_mode_check;
ALTER TABLE rm.bookings ADD CONSTRAINT bookings_commission_payment_mode_check
  CHECK (
    commission_payment_mode IS NULL
    OR commission_payment_mode IN ('upi', 'cash', 'bank_transfer', 'card', 'other')
  );

COMMENT ON COLUMN rm.bookings.commission_payment_mode IS
  'How the MUA paid Olready commission (UPI, bank transfer, etc.)';

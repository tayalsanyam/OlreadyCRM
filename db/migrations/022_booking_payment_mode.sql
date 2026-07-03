ALTER TABLE rm.bookings
  ADD COLUMN IF NOT EXISTS payment_mode TEXT
  CHECK (
    payment_mode IS NULL
    OR payment_mode IN ('upi', 'cash', 'bank_transfer', 'card', 'other')
  );

-- Olready commission from MUA (per booking, manual amount at confirm).

ALTER TABLE rm.bookings
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS commission_paid NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS commission_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bride_fully_paid_at TIMESTAMPTZ;

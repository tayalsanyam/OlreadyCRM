-- Commission collection SLA: RM follow-up date + cron task tracking.

ALTER TABLE rm.bookings
  ADD COLUMN IF NOT EXISTS commission_next_follow_up_at DATE;

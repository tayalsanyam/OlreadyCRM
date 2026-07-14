-- Snapshot plan / price on stage transitions (Details Shared, Confirm, Deal Closed).

ALTER TABLE sales.stage_log
  ADD COLUMN IF NOT EXISTS metadata JSONB;

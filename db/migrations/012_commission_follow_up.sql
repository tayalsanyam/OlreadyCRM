-- Commission RM follow-up amounts (editable until booking confirmed)
ALTER TABLE rm.bride_leads
  ADD COLUMN IF NOT EXISTS commission_offered NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS commission_agreed NUMERIC(12, 2);

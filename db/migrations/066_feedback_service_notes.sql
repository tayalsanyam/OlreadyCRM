-- Separate notes for Olready service and booked MUA service.

ALTER TABLE rm.lead_feedback
  ADD COLUMN IF NOT EXISTS olready_service_note TEXT,
  ADD COLUMN IF NOT EXISTS mua_service_note TEXT;

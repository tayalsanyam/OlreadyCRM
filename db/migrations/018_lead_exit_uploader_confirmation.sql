-- Uploader accountability on not-interested / exit review
ALTER TABLE bride_leads
  ADD COLUMN IF NOT EXISTS uploader_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS uploader_confirmed_by UUID REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS uploader_confirmation TEXT;

COMMENT ON COLUMN bride_leads.uploader_confirmation IS
  'confirmed_ni | rm_error | reopen — set by lead uploader on NI review';

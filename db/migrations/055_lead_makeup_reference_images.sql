-- Reference images uploaded for bride makeup look (RM lead profile)
CREATE TABLE IF NOT EXISTS lead_makeup_reference_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES bride_leads(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_makeup_ref_images_lead
  ON lead_makeup_reference_images(lead_id);

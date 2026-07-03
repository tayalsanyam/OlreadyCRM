-- Bride makeup look preferences (lead-level profile)
CREATE TABLE IF NOT EXISTS bride_makeup_look_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES bride_leads(id) ON DELETE CASCADE,

  makeup_look_category TEXT[] NOT NULL DEFAULT '{}',
  makeup_technique_preference TEXT[] NOT NULL DEFAULT '{}',
  base_coverage_preference TEXT,
  finish_preference TEXT[] NOT NULL DEFAULT '{}',
  makeup_intensity TEXT,
  skin_visibility_comfort TEXT,

  eye_look_preference TEXT[] NOT NULL DEFAULT '{}',
  lash_preference TEXT,
  lip_shade_preference TEXT[] NOT NULL DEFAULT '{}',
  lip_finish_preference TEXT,
  feature_emphasis TEXT[] NOT NULL DEFAULT '{}',

  reference_source TEXT[] NOT NULL DEFAULT '{}',
  reference_images_uploaded BOOLEAN NOT NULL DEFAULT FALSE,
  look_clarity TEXT,
  look_notes TEXT,
  same_look_all_events BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (lead_id)
);

CREATE INDEX IF NOT EXISTS idx_bride_makeup_look_lead_id ON bride_makeup_look_profiles(lead_id);

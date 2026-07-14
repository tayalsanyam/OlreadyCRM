-- Multiple regions per MUA + profile details

CREATE TABLE IF NOT EXISTS rm.mua_regions (
  mua_id UUID NOT NULL REFERENCES rm.muas(id) ON DELETE CASCADE,
  region rm.region NOT NULL,
  PRIMARY KEY (mua_id, region)
);

CREATE INDEX IF NOT EXISTS idx_rm_mua_regions_region ON rm.mua_regions(region);

INSERT INTO rm.mua_regions (mua_id, region)
SELECT id, region FROM rm.muas WHERE region IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE rm.muas
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS services TEXT[] DEFAULT '{}';

ALTER TABLE rm.muas DROP COLUMN IF EXISTS region;

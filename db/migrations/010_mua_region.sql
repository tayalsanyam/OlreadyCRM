-- Assign each MUA to a region for regional RM roster filtering

ALTER TABLE rm.muas
  ADD COLUMN IF NOT EXISTS region rm.region;

UPDATE rm.muas
SET region = 'north'::rm.region
WHERE region IS NULL
  AND lower(trim(city)) IN (
    'delhi', 'jaipur', 'chandigarh', 'noida', 'gurgaon', 'gurugram'
  );

UPDATE rm.muas
SET region = 'east'::rm.region
WHERE region IS NULL
  AND lower(trim(city)) IN ('kolkata', 'bhubaneswar', 'patna');

UPDATE rm.muas
SET region = 'west'::rm.region
WHERE region IS NULL
  AND lower(trim(city)) IN ('mumbai', 'pune', 'ahmedabad', 'surat');

UPDATE rm.muas
SET region = 'south'::rm.region
WHERE region IS NULL
  AND lower(trim(city)) IN (
    'bangalore', 'bengaluru', 'chennai', 'hyderabad', 'kochi'
  );

CREATE INDEX IF NOT EXISTS idx_rm_muas_region ON rm.muas(region);

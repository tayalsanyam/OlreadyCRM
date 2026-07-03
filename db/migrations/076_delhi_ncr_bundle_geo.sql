-- Delhi NCR is a metro bundle picker label, not a legal state under Delhi UT.
-- Faridabad added to NCR city set.

UPDATE rm.city_regions
SET state = NULL
WHERE city IN ('Delhi NCR', 'NCR');

INSERT INTO rm.city_regions (city, region, state) VALUES
  ('Faridabad', 'north', 'Haryana')
ON CONFLICT (city) DO UPDATE SET
  region = EXCLUDED.region,
  state = COALESCE(EXCLUDED.state, rm.city_regions.state);

UPDATE rm.city_regions SET state = 'Haryana'
WHERE city IN ('Gurgaon', 'Gurugram', 'Panipat', 'Faridabad')
  AND (state IS NULL OR state = '');

UPDATE rm.city_regions SET state = 'Uttar Pradesh'
WHERE city IN ('Noida', 'Ghaziabad')
  AND (state IS NULL OR state = '');

UPDATE rm.city_regions SET state = 'Delhi'
WHERE city = 'Delhi' AND (state IS NULL OR state = '');

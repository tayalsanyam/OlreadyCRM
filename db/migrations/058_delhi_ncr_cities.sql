-- Delhi NCR coverage: Panipat + alias row for "Delhi NCR" → North
INSERT INTO rm.city_regions (city, region, state) VALUES
  ('Panipat', 'north', 'Haryana'),
  ('Delhi NCR', 'north', 'Delhi')
ON CONFLICT (city) DO UPDATE SET
  region = EXCLUDED.region,
  state = COALESCE(EXCLUDED.state, rm.city_regions.state);

UPDATE rm.city_regions SET state = 'Haryana' WHERE city IN ('Gurgaon', 'Gurugram') AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Uttar Pradesh' WHERE city = 'Noida' AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Haryana' WHERE city = 'Panipat' AND (state IS NULL OR state = '');

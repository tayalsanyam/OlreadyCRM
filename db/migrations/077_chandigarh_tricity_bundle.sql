-- Chandigarh Tricity: Mohali (Punjab), Panchkula (Haryana), Chandigarh (UT).
-- Bundle label row has no legal state (picker only).

INSERT INTO rm.city_regions (city, region, state) VALUES
  ('Mohali', 'north', 'Punjab'),
  ('Panchkula', 'north', 'Haryana'),
  ('Chandigarh Tricity', 'north', NULL)
ON CONFLICT (city) DO UPDATE SET
  region = EXCLUDED.region,
  state = EXCLUDED.state;

UPDATE rm.city_regions SET state = 'Chandigarh'
WHERE city = 'Chandigarh' AND (state IS NULL OR state = '');

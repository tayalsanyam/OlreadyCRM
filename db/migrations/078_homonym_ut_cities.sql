-- Homonym UT/state cities: Goa (state name = market name). Puducherry already seeded.

INSERT INTO rm.city_regions (city, region, state) VALUES
  ('Goa', 'west', 'Goa')
ON CONFLICT (city) DO UPDATE SET
  region = EXCLUDED.region,
  state = COALESCE(EXCLUDED.state, rm.city_regions.state);

UPDATE rm.city_regions SET state = 'Puducherry'
WHERE city IN ('Puducherry', 'Pondicherry') AND (state IS NULL OR state = '');

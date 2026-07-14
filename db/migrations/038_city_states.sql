-- Geography: city → state → region; plan onboarding states[]

ALTER TABLE rm.city_regions
  ADD COLUMN IF NOT EXISTS state TEXT;

-- Backfill Indian states for seeded cities (idempotent)
UPDATE rm.city_regions SET state = 'Delhi' WHERE city = 'Delhi' AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Uttar Pradesh' WHERE city IN ('Noida', 'Ghaziabad', 'Meerut', 'Kanpur', 'Agra', 'Varanasi', 'Lucknow') AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Haryana' WHERE city IN ('Gurugram', 'Gurgaon') AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Chandigarh' WHERE city = 'Chandigarh' AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Rajasthan' WHERE city = 'Jaipur' AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Punjab' WHERE city IN ('Amritsar', 'Ludhiana') AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Uttarakhand' WHERE city = 'Dehradun' AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Maharashtra' WHERE city IN ('Mumbai', 'Pune', 'Thane', 'Nashik', 'Aurangabad', 'Nagpur') AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Gujarat' WHERE city IN ('Ahmedabad', 'Surat', 'Vadodara', 'Rajkot') AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Madhya Pradesh' WHERE city IN ('Indore', 'Bhopal') AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Karnataka' WHERE city IN ('Bengaluru', 'Bangalore', 'Mysuru') AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Tamil Nadu' WHERE city IN ('Chennai', 'Coimbatore', 'Madurai') AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Telangana' WHERE city = 'Hyderabad' AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Andhra Pradesh' WHERE city IN ('Vizag', 'Vijayawada', 'Tirupati') AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Kerala' WHERE city IN ('Kochi', 'Calicut', 'Thiruvananthapuram') AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'West Bengal' WHERE city IN ('Kolkata', 'Siliguri') AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Odisha' WHERE city IN ('Bhubaneswar', 'Cuttack') AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Assam' WHERE city = 'Guwahati' AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Tripura' WHERE city = 'Agartala' AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Bihar' WHERE city = 'Patna' AND (state IS NULL OR state = '');
UPDATE rm.city_regions SET state = 'Jharkhand' WHERE city IN ('Ranchi', 'Jamshedpur') AND (state IS NULL OR state = '');

CREATE INDEX IF NOT EXISTS idx_city_regions_state ON rm.city_regions (state);

ALTER TABLE sales.onboarding
  ADD COLUMN IF NOT EXISTS states TEXT[] DEFAULT '{}';

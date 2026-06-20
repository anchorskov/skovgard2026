-- Candidates/db/seed/polling_locations_sheridan_insert.sql
-- Sheridan County 2026 primary polling locations, conservative partial seed.
-- Source: Sheridan County official Polling Locations page, verified 2026-06-20.
-- City of Sheridan precinct rows are intentionally not seeded here because the current lookup
-- only has city-level D1 matching and Sheridan has many different precinct polling locations.
-- Address corrections verified by user on 2026-06-20 from 2024 county polling PDF:
-- Arvada, Clearmont, Big Horn, Wyarno, Ranchester, and Slack rows now include street addresses.
INSERT INTO polling_locations
  (county, precinct_code, precinct_name, location_name, address, city, zip, election_year, county_clerk_url)
VALUES
  ('Sheridan','8-1','Story','Story Woman''s Club','28 North Piney, Story, WY 82842','Story','82842',2026,'https://www.sheridancountywy.gov/departments/elections/polling_locations.php'),
  ('Sheridan','9-1','Arvada','Clearmont Fire Hall (Arvada)','124 Main St, Arvada, WY 82831','Arvada','82831',2026,'https://www.sheridancountywy.gov/departments/elections/polling_locations.php'),
  ('Sheridan','10-1','Clearmont','Clearmont Town Hall','1605 Pennsylvania Ave, Clearmont, WY 82835','Clearmont','82835',2026,'https://www.sheridancountywy.gov/departments/elections/polling_locations.php'),
  ('Sheridan','12-1','Big Horn','Big Horn Women''s Club','314 S 2nd St, Big Horn, WY 82833','Big Horn','82833',2026,'https://www.sheridancountywy.gov/departments/elections/polling_locations.php'),
  ('Sheridan','16-1','Wyarno','Wyarno Fire Hall','663 Wyarno Rd, Sheridan, WY 82801','Wyarno',NULL,2026,'https://www.sheridancountywy.gov/departments/elections/polling_locations.php'),
  ('Sheridan','17-1','Ranchester Inside City','Ranchester Town Hall','145 Coffeen St, Ranchester, WY 82839','Ranchester','82839',2026,'https://www.sheridancountywy.gov/departments/elections/polling_locations.php'),
  ('Sheridan','17-2','Ranchester Outside City','Ranchester Town Hall','145 Coffeen St, Ranchester, WY 82839','Ranchester','82839',2026,'https://www.sheridancountywy.gov/departments/elections/polling_locations.php'),
  ('Sheridan','18-1','Slack','Ranchester Town Hall','145 Coffeen St, Ranchester, WY 82839','Slack',NULL,2026,'https://www.sheridancountywy.gov/departments/elections/polling_locations.php'),
  ('Sheridan','20-1','Dayton','Tongue River Community Center','1100 US Hwy 14, Dayton, WY 82836','Dayton','82836',2026,'https://www.sheridancountywy.gov/departments/elections/polling_locations.php'),
  ('Sheridan','20-2','Dayton','Tongue River Community Center','1100 US Hwy 14, Dayton, WY 82836','Dayton','82836',2026,'https://www.sheridancountywy.gov/departments/elections/polling_locations.php');

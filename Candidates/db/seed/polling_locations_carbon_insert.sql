-- Candidates/db/seed/polling_locations_carbon_insert.sql
-- Carbon County 2026 primary polling locations
-- Source: Carbon County official Polling Places and Precincts/Districts page, verified 2026-06-20.
-- Combined source rows 12-01/13-01 and 14-01/15-01 are split into voter-city lookup rows.
INSERT INTO polling_locations
  (county, precinct_code, precinct_name, location_name, address, city, zip, election_year, county_clerk_url)
VALUES
  ('Carbon','01-01','Rawlins','Jeffrey Center','315 West Pine Street, Rawlins, WY 82301','Rawlins','82301',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','01-02','Rawlins','Jeffrey Center','315 West Pine Street, Rawlins, WY 82301','Rawlins','82301',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','02-01','Rawlins','Jeffrey Center','315 West Pine Street, Rawlins, WY 82301','Rawlins','82301',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','02-02','Rawlins','Jeffrey Center','315 West Pine Street, Rawlins, WY 82301','Rawlins','82301',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','03-01','Rawlins','Jeffrey Center','315 West Pine Street, Rawlins, WY 82301','Rawlins','82301',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','03-02','Rawlins','Jeffrey Center','315 West Pine Street, Rawlins, WY 82301','Rawlins','82301',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','04-01','Muddy Gap','Jeffrey Center','315 West Pine Street, Rawlins, WY 82301','Muddy Gap','82301',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','05-01','Sinclair','Jeffrey Center','315 West Pine Street, Rawlins, WY 82301','Sinclair','82334',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','06-01','Hanna','Hanna Town Hall','301 S. Adams Street, Hanna, WY 82327','Hanna','82327',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','07-01','Medicine Bow','Medicine Bow Community Center','221 Pine Street, Medicine Bow, WY 82329','Medicine Bow','82329',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','08-01','Hanna','Hanna Town Hall','301 S. Adams Street, Hanna, WY 82327','Hanna','82327',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','09-01','Elk Mountain','Elk Mountain Senior Center','208 Bridge St., Elk Mountain, WY 82324','Elk Mountain','82324',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','10-01','Elk Mountain','Elk Mountain Senior Center','208 Bridge St., Elk Mountain, WY 82324','Elk Mountain','82324',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','11-01','Saratoga','Platte Valley Community Center','210 W. Elm Avenue, Saratoga, WY 82331','Saratoga','82331',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','11-02','Saratoga','Platte Valley Community Center','210 W. Elm Avenue, Saratoga, WY 82331','Saratoga','82331',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','12-01','Encampment','Encampment Opera House','622 Rankin Avenue, Encampment, WY 82325','Encampment','82325',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','13-01','Riverside','Encampment Opera House','622 Rankin Avenue, Encampment, WY 82325','Riverside','82325',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','14-01','Baggs','Valley Community Center','255 W. Osborne St., Baggs, WY 82321','Baggs','82321',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts'),
  ('Carbon','15-01','Dixon','Valley Community Center','255 W. Osborne St., Baggs, WY 82321','Dixon','82323',2026,'https://www.carboncountywy.gov/942/Polling-Places-and-PrecinctsDistricts');

-- Candidates/db/seed/polling_locations_albany_insert.sql
-- Albany County 2026 primary/general vote centers
-- Source: Notice of 2026 Election Cycle Polling Locations PDF supplied by user.
-- Albany County uses vote centers: voters in all districts and precincts may cast
-- a ballot at any listed vote center regardless of designated district/precinct.
-- `city = '__countywide__'` makes these rows available for any Albany County lookup.
INSERT INTO polling_locations
  (county, precinct_code, precinct_name, location_name, address, city, zip, election_year, county_clerk_url)
VALUES
  ('Albany','COUNTYWIDE','Countywide vote center','Albany County Fairgrounds','3510 S. 3rd Street, Laramie, WY 82070','__countywide__',NULL,2026,'https://www.albanycountywy.gov/1591/Vote-Centers'),
  ('Albany','COUNTYWIDE','Countywide vote center','Albany County Public Library','310 S. 8th Street, Laramie, WY 82070','__countywide__',NULL,2026,'https://www.albanycountywy.gov/1591/Vote-Centers'),
  ('Albany','COUNTYWIDE','Countywide vote center','Centennial School','2771 HWY 130, Laramie, WY 82055','__countywide__',NULL,2026,'https://www.albanycountywy.gov/1591/Vote-Centers'),
  ('Albany','COUNTYWIDE','Countywide vote center','Harmony School','20 Lewis Road, Laramie, WY 82070','__countywide__',NULL,2026,'https://www.albanycountywy.gov/1591/Vote-Centers'),
  ('Albany','COUNTYWIDE','Countywide vote center','Laramie Peak Fire Hall','1836 Cottonwood Park Road, Wheatland, WY 82201','__countywide__',NULL,2026,'https://www.albanycountywy.gov/1591/Vote-Centers'),
  ('Albany','COUNTYWIDE','Countywide vote center','Lincoln Community Center','365 W. Grand Avenue, Laramie, WY 82070','__countywide__',NULL,2026,'https://www.albanycountywy.gov/1591/Vote-Centers'),
  ('Albany','COUNTYWIDE','Countywide vote center','MHR Gateway Center','222 S. 22nd Street, Laramie, WY 82070','__countywide__',NULL,2026,'https://www.albanycountywy.gov/1591/Vote-Centers'),
  ('Albany','COUNTYWIDE','Countywide vote center','Municipal Operations Center','4373 N. 3rd Street, Laramie, WY 82072','__countywide__',NULL,2026,'https://www.albanycountywy.gov/1591/Vote-Centers'),
  ('Albany','COUNTYWIDE','Countywide vote center','Rock River Town Hall','386 Avenue D, Rock River, WY 82083','__countywide__',NULL,2026,'https://www.albanycountywy.gov/1591/Vote-Centers'),
  ('Albany','COUNTYWIDE','Countywide vote center','Sybille Wildlife Research Unit','2362 HWY 34, Wheatland, WY 82201','__countywide__',NULL,2026,'https://www.albanycountywy.gov/1591/Vote-Centers');

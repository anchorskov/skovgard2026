-- Candidates/db/seed/polling_locations_platte_insert.sql
-- Platte County 2026 primary polling locations
-- Source: Platte County official Polling Places page, verified 2026-06-20.
-- `city` is the voter's home city/area lookup key; `address` is the polling place address.
INSERT INTO polling_locations
  (county, precinct_code, precinct_name, location_name, address, city, zip, election_year, county_clerk_url)
VALUES
  ('Platte','1-1','1F','Agriplex 4-H Building','59 Antelope Gap Rd, Wheatland, WY 82201','Wheatland','82201',2026,'https://www.plattecountywyoming.com/departments/Elections/PollingPlaces'),
  ('Platte','1-2','2F','Agriplex 4-H Building','59 Antelope Gap Rd, Wheatland, WY 82201','Wheatland','82201',2026,'https://www.plattecountywyoming.com/departments/Elections/PollingPlaces'),
  ('Platte','1-3','Antelope Gap','Agriplex 4-H Building','59 Antelope Gap Rd, Wheatland, WY 82201','Antelope Gap','82201',2026,'https://www.plattecountywyoming.com/departments/Elections/PollingPlaces'),
  ('Platte','1-6','Wheatland Town','Agriplex 4-H Building','59 Antelope Gap Rd, Wheatland, WY 82201','Wheatland','82201',2026,'https://www.plattecountywyoming.com/departments/Elections/PollingPlaces'),
  ('Platte','2-1','Guernsey Town','Guernsey VFW','42 S. Idaho Ave., Guernsey, WY 82214','Guernsey','82214',2026,'https://www.plattecountywyoming.com/departments/Elections/PollingPlaces'),
  ('Platte','2-2','Sunrise','Guernsey VFW','42 S. Idaho Ave., Guernsey, WY 82214','Sunrise','82214',2026,'https://www.plattecountywyoming.com/departments/Elections/PollingPlaces'),
  ('Platte','3-1','Glendo','Glendo Town Hall','114 S. Yellowstone Hwy., Glendo, WY 82213','Glendo','82213',2026,'https://www.plattecountywyoming.com/departments/Elections/PollingPlaces'),
  ('Platte','4-1','Chugwater Town & Rural','Chugwater Community Center','311 2nd St., Chugwater, WY 82210','Chugwater','82210',2026,'https://www.plattecountywyoming.com/departments/Elections/PollingPlaces');

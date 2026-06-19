-- Candidates/db/seed/polling_locations_converse_insert.sql
-- Converse County 2026 polling locations — 19 precincts, 4 venues.
-- Source: 2026 CONVERSE COUNTY POLLING LOCATIONS.pdf (official county PDF).
-- Generated from polling_locations_converse.csv.

INSERT INTO polling_locations
  (county, precinct_code, precinct_name, location_name, address, city, zip, election_year, county_clerk_url)
VALUES
  ('Converse', '1-1', 'Lost Springs', 'Eastern Wyoming College', '800 S. Wind River Drive, Douglas, WY 82633', 'Douglas', '82633', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '2-2', 'Orin', 'Douglas Rec Center', '1701 Hamilton Street, Douglas, WY 82633', 'Douglas', '82633', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '3-1', 'Guthrie', 'Eastern Wyoming College', '800 S. Wind River Drive, Douglas, WY 82633', 'Douglas', '82633', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '4-4', 'Rural Douglas', 'Douglas Rec Center', '1701 Hamilton Street, Douglas, WY 82633', 'Douglas', '82633', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '6-6', 'Boxelder', 'Glenrock Rec Center', '412 S. 4th Street, Glenrock, WY 82637', 'Glenrock', '82637', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '7-7', 'LaPrele', 'Douglas Rec Center', '1701 Hamilton Street, Douglas, WY 82633', 'Douglas', '82633', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '8-8', 'East Antelope', 'Eastern Wyoming College', '800 S. Wind River Drive, Douglas, WY 82633', 'Douglas', '82633', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '9-1', 'East Glenrock', 'Glenrock Rec Center', '412 S. 4th Street, Glenrock, WY 82637', 'Glenrock', '82637', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '9-2', 'West Glenrock', 'Glenrock Rec Center', '412 S. 4th Street, Glenrock, WY 82637', 'Glenrock', '82637', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '10-10', 'Rural Glenrock', 'Glenrock Rec Center', '412 S. 4th Street, Glenrock, WY 82637', 'Glenrock', '82637', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '11-11', 'Rolling Hills', 'Glenrock Rec Center', '412 S. 4th Street, Glenrock, WY 82637', 'Glenrock', '82637', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '13-13', 'Dry Creek', 'Dry Creek Hall', '3549 Hwy. 59, Douglas, WY 82633', 'Douglas', '82633', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '20-20', 'Orpha', 'Douglas Rec Center', '1701 Hamilton Street, Douglas, WY 82633', 'Douglas', '82633', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '23-1', 'Northeast Douglas', 'Douglas Rec Center', '1701 Hamilton Street, Douglas, WY 82633', 'Douglas', '82633', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '23-2', 'Northwest Douglas', 'Douglas Rec Center', '1701 Hamilton Street, Douglas, WY 82633', 'Douglas', '82633', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '23-3', 'Southwest Douglas', 'Douglas Rec Center', '1701 Hamilton Street, Douglas, WY 82633', 'Douglas', '82633', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '23-4', 'Courthouse', 'Douglas Rec Center', '1701 Hamilton Street, Douglas, WY 82633', 'Douglas', '82633', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '23-5', 'South Douglas', 'Douglas Rec Center', '1701 Hamilton Street, Douglas, WY 82633', 'Douglas', '82633', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php'),
  ('Converse', '23-6', 'Fairview', 'Douglas Rec Center', '1701 Hamilton Street, Douglas, WY 82633', 'Douglas', '82633', 2026, 'https://www.conversecountywy.gov/departments/county_clerk/index.php');

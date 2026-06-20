-- Candidates/db/seed/polling_locations_crook_insert.sql
-- Crook County 2026 primary polling locations
-- Source: Crook County official 2026 Election Districts & Precincts and Polling Locations page, verified 2026-06-20.
-- `city` is the voter's home city/area lookup key; `address` is the polling place address.
INSERT INTO polling_locations
  (county, precinct_code, precinct_name, location_name, address, city, zip, election_year, county_clerk_url)
VALUES
  ('Crook','01-01','Sundance Inside North','Courthouse Basement','309 Cleveland Street, Sundance, WY 82729','Sundance','82729',2026,'https://www.crookcounty.wy.gov/elected_officials/clerk/election/designation_of_polling_places.php'),
  ('Crook','01-02','Sundance Inside South','Courthouse Basement','309 Cleveland Street, Sundance, WY 82729','Sundance','82729',2026,'https://www.crookcounty.wy.gov/elected_officials/clerk/election/designation_of_polling_places.php'),
  ('Crook','02-02','Sundance Outside','Courthouse Basement','309 Cleveland Street, Sundance, WY 82729','Sundance','82729',2026,'https://www.crookcounty.wy.gov/elected_officials/clerk/election/designation_of_polling_places.php'),
  ('Crook','03-03','Beulah','Beulah Community Building','5850 Old Hwy 14, Beulah, WY 82712','Beulah','82712',2026,'https://www.crookcounty.wy.gov/elected_officials/clerk/election/designation_of_polling_places.php'),
  ('Crook','07-07','Aladdin','Aladdin Community Building','3997 State Hwy 24, Aladdin, WY 82710','Aladdin','82710',2026,'https://www.crookcounty.wy.gov/elected_officials/clerk/election/designation_of_polling_places.php'),
  ('Crook','09-09','Alva','Greater Hulett Community Center','401 Sager Street, Hulett, WY 82720','Alva','82711',2026,'https://www.crookcounty.wy.gov/elected_officials/clerk/election/designation_of_polling_places.php'),
  ('Crook','11-11','Tower Junction','RAM Center','18048 US Hwy 14, Sundance, WY 82729','Tower Junction','82729',2026,'https://www.crookcounty.wy.gov/elected_officials/clerk/election/designation_of_polling_places.php'),
  ('Crook','13-13','Hulett Outside','Greater Hulett Community Center','401 Sager Street, Hulett, WY 82720','Hulett','82720',2026,'https://www.crookcounty.wy.gov/elected_officials/clerk/election/designation_of_polling_places.php'),
  ('Crook','14-14','Hulett Inside','Greater Hulett Community Center','401 Sager Street, Hulett, WY 82720','Hulett','82720',2026,'https://www.crookcounty.wy.gov/elected_officials/clerk/election/designation_of_polling_places.php'),
  ('Crook','16-16','Moorcroft Outside','Moorcroft Town Center','101 S. Belle Fourche Avenue, Moorcroft, WY 82721','Moorcroft','82721',2026,'https://www.crookcounty.wy.gov/elected_officials/clerk/election/designation_of_polling_places.php'),
  ('Crook','18-01','Moorcroft West Side','Moorcroft Town Center','101 S. Belle Fourche Avenue, Moorcroft, WY 82721','Moorcroft','82721',2026,'https://www.crookcounty.wy.gov/elected_officials/clerk/election/designation_of_polling_places.php'),
  ('Crook','18-02','Moorcroft East Side','Moorcroft Town Center','101 S. Belle Fourche Avenue, Moorcroft, WY 82721','Moorcroft','82721',2026,'https://www.crookcounty.wy.gov/elected_officials/clerk/election/designation_of_polling_places.php'),
  ('Crook','23-23','New Haven','Greater Hulett Community Center','401 Sager Street, Hulett, WY 82720','New Haven','82720',2026,'https://www.crookcounty.wy.gov/elected_officials/clerk/election/designation_of_polling_places.php');

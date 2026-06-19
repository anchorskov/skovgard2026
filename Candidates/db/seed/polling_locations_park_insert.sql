-- Park County 2026 primary polling locations
-- Source: Park County GIS precinct map (TerraCIS screenshot) + official 2026 polling place list
-- All names and addresses verified against Park County official 2026 source 2026-06-19.
-- Garland and Willwood precincts vote at Park County Fairgrounds - Heart Mountain Hall (655 E 5th St).
INSERT INTO polling_locations
  (county, precinct_code, precinct_name, location_name, address, city, zip, election_year, county_clerk_url)
VALUES
  -- Clark
  ('Park','1-1','Clark-Sirrine','Clark Pioneer Recreation Center','321 Road 1AB, Clark, WY 82435','Clark','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Cody — Auditorium (center precincts 2-1, 24, 25 series)
  ('Park','2-1','Cody East & North Inside','Cody Auditorium','1240 Beck Ave, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','24-1-1','Cody Center Inside','Cody Auditorium','1240 Beck Ave, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','24-1-2','Cody Center-North Inside','Cody Auditorium','1240 Beck Ave, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','25-1','Cody Center-South Inside','Cody Auditorium','1240 Beck Ave, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Cody — Recreation Center (3-x, 4-2-x, 11-2 series)
  ('Park','3-1','Cody East & North Outside','Cody Recreation Center','1402 Heart Mountain St, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','3-2-1','Cody East & South Outside','Cody Recreation Center','1402 Heart Mountain St, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','3-2-2','Cody East & South Outside','Cody Recreation Center','1402 Heart Mountain St, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','4-2-1','Cody West & North Outside','Cody Recreation Center','1402 Heart Mountain St, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','4-2-2','Cody West & North Outside','Cody Recreation Center','1402 Heart Mountain St, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','4-2-3','Cody West & North Outside','Cody Recreation Center','1402 Heart Mountain St, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','11-2','Crandall-Painter','Cody Recreation Center','1402 Heart Mountain St, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Cody — South Fork Fire Hall (rural 4-1 and Valley 7-2; Cody mailing address)
  ('Park','4-1','Cody West & South Outside','South Fork Fire Hall','3 Road 6NQ, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','7-2','Valley','South Fork Fire Hall','3 Road 6NQ, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Wapiti
  ('Park','16-1-1','Wapiti','Wapiti Elementary School','3167 North Fork Hwy, Cody, WY 82414','Wapiti','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','16-1-2','Wapiti','Wapiti Elementary School','3167 North Fork Hwy, Cody, WY 82414','Wapiti','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Meeteetse
  ('Park','8-1','Below Meeteetse','Meeteetse Rec Center','1608 Kentucky Ave, Meeteetse, WY 82433','Meeteetse','82433',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','8-2','Meeteetse Town','Meeteetse Rec Center','1608 Kentucky Ave, Meeteetse, WY 82433','Meeteetse','82433',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','8-3','Above Meeteetse','Meeteetse Rec Center','1608 Kentucky Ave, Meeteetse, WY 82433','Meeteetse','82433',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Powell — Fairgrounds (9-x, 10-1-x, 21-1-1, Garland 6-1-x, Frannie 6-1-3, Willwood 10-2, 23-1)
  ('Park','9-1','Powell Center & West Inside','Park County Fairgrounds - Heart Mountain Hall','655 E 5th St, Powell, WY 82435','Powell','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','9-5','Powell West & North Inside','Park County Fairgrounds - Heart Mountain Hall','655 E 5th St, Powell, WY 82435','Powell','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','9-7','Powell South & East Inside','Park County Fairgrounds - Heart Mountain Hall','655 E 5th St, Powell, WY 82435','Powell','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','10-1-1','Powell','Park County Fairgrounds - Heart Mountain Hall','655 E 5th St, Powell, WY 82435','Powell','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','10-1-2','Powell North Outside','Park County Fairgrounds - Heart Mountain Hall','655 E 5th St, Powell, WY 82435','Powell','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','21-1-1','Powell West','Park County Fairgrounds - Heart Mountain Hall','655 E 5th St, Powell, WY 82435','Powell','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Powell — Heart Mountain Clubhouse (21-1-2)
  ('Park','21-1-2','Cody East & North Outside','Heart Mountain Clubhouse','1001 Road 18, Powell, WY 82435','Powell','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Garland and Frannie vote at Park County Fairgrounds (not Garland Community Center)
  ('Park','6-1-1','Garland','Park County Fairgrounds - Heart Mountain Hall','655 E 5th St, Powell, WY 82435','Garland','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','6-1-2','Garland','Park County Fairgrounds - Heart Mountain Hall','655 E 5th St, Powell, WY 82435','Garland','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','6-1-3','Frannie','Park County Fairgrounds - Heart Mountain Hall','655 E 5th St, Powell, WY 82435','Frannie','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Willwood votes at Park County Fairgrounds (not Willwood Community Center)
  ('Park','10-2','Willwood South River','Park County Fairgrounds - Heart Mountain Hall','655 E 5th St, Powell, WY 82435','Willwood','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','23-1','Willwood','Park County Fairgrounds - Heart Mountain Hall','655 E 5th St, Powell, WY 82435','Willwood','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk');

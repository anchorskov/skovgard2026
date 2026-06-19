-- Park County 2026 primary polling locations
-- Source: Park County GIS precinct map (screencap), TerraCIS
-- Polling locations visible on map confirmed; inferred for unlabeled Cody/Powell precincts.
-- Street addresses for Cody Auditorium, South Fork Fire Hall, Wapiti School,
--   Garland Community Center, Willwood Community Center, and Fairgrounds need
--   field verification — city/state are correct, street numbers are approximate.
INSERT INTO polling_locations
  (county, precinct_code, precinct_name, location_name, address, city, zip, election_year, county_clerk_url)
VALUES
  -- Clark
  ('Park','1-1','Clark-Sirrine','Clark Community Center','Clark, WY','Clark',NULL,2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Cody — Auditorium (center precincts 2-1, 24, 25 series)
  ('Park','2-1','Cody East & North Inside','Cody Auditorium','Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','24-1-1','Cody Center Inside','Cody Auditorium','Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','24-1-2','Cody Center-North Inside','Cody Auditorium','Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','25-1','Cody Center-South Inside','Cody Auditorium','Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Cody — Rec Center (3-x, 4-2-x, 11-2 series)
  ('Park','3-1','Cody East & North Outside','Cody Rec Center','1402 Heart Mountain St, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','3-2-1','Cody East & South Outside','Cody Rec Center','1402 Heart Mountain St, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','3-2-2','Cody East & South Outside','Cody Rec Center','1402 Heart Mountain St, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','4-2-1','Cody West & North Outside','Cody Rec Center','1402 Heart Mountain St, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','4-2-2','Cody West & North Outside','Cody Rec Center','1402 Heart Mountain St, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','4-2-3','Cody West & North Outside','Cody Rec Center','1402 Heart Mountain St, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','11-2','Crandall-Painter','Cody Rec Center','1402 Heart Mountain St, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Cody — South Fork Fire Hall (rural 4-1 and Valley 7-2; Cody ZIP/mailing)
  ('Park','4-1','Cody West & South Outside','South Fork Fire Hall','South Fork Rd, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','7-2','Valley','South Fork Fire Hall','South Fork Rd, Cody, WY 82414','Cody','82414',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Wapiti
  ('Park','16-1-1','Wapiti','Wapiti School','Wapiti, WY 82450','Wapiti','82450',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','16-1-2','Wapiti','Wapiti School','Wapiti, WY 82450','Wapiti','82450',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Meeteetse
  ('Park','8-1','Below Meeteetse','Meeteetse Rec Center','Meeteetse, WY 82433','Meeteetse','82433',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','8-2','Meeteetse Town','Meeteetse Rec Center','Meeteetse, WY 82433','Meeteetse','82433',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','8-3','Above Meeteetse','Meeteetse Rec Center','Meeteetse, WY 82433','Meeteetse','82433',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Powell — Fairgrounds (9-x, 10-1-x, 21-1-1)
  ('Park','9-1','Powell Center & West Inside','Park County Fairgrounds','Powell, WY 82435','Powell','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','9-5','Powell West & North Inside','Park County Fairgrounds','Powell, WY 82435','Powell','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','9-7','Powell South & East Inside','Park County Fairgrounds','Powell, WY 82435','Powell','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','10-1-1','Powell','Park County Fairgrounds','Powell, WY 82435','Powell','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','10-1-2','Powell North Outside','Park County Fairgrounds','Powell, WY 82435','Powell','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','21-1-1','Powell West','Park County Fairgrounds','Powell, WY 82435','Powell','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Powell — Heart Mountain Club House (21-1-2; Heart Mountain is near Powell)
  ('Park','21-1-2','Cody East & North Outside','Heart Mountain Club House','Heart Mountain, WY 82435','Powell','82435',2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Garland
  ('Park','6-1-1','Garland','Garland Community Center','Garland, WY','Garland',NULL,2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','6-1-2','Garland','Garland Community Center','Garland, WY','Garland',NULL,2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Frannie (Park County side) votes at Garland Community Center
  ('Park','6-1-3','Frannie','Garland Community Center','Garland, WY','Frannie',NULL,2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  -- Willwood
  ('Park','10-2','Willwood South River','Willwood Community Center','Willwood, WY','Willwood',NULL,2026,'https://www.parkcountywy.gov/289/County-Clerk'),
  ('Park','23-1','Willwood','Willwood Community Center','Willwood, WY','Willwood',NULL,2026,'https://www.parkcountywy.gov/289/County-Clerk');

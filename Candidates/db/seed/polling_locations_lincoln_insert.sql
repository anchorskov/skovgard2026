-- Candidates/db/seed/polling_locations_lincoln_insert.sql
-- Lincoln County 2026 primary polling locations
-- Source: Lincoln County official "POLLING PLACE LOCATIONS 2026 PDF.pdf", verified 2026-06-20.
-- `city` is the voter's home city/area lookup key; `address` is the polling place address.
-- Source does not list ZIP codes for polling-place addresses, so ZIPs are left NULL instead of guessed.
INSERT INTO polling_locations
  (county, precinct_code, precinct_name, location_name, address, city, zip, election_year, county_clerk_url)
VALUES
  ('Lincoln','1-1','Kemmerer','South Lincoln Training & Events Center','215 WY Hwy 233, Kemmerer, WY','Kemmerer',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','1-4','Diamondville','South Lincoln Training & Events Center','215 WY Hwy 233, Kemmerer, WY','Diamondville',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','1-6','Frontier','South Lincoln Training & Events Center','215 WY Hwy 233, Kemmerer, WY','Frontier',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','1-7','Opal','South Lincoln Training & Events Center','215 WY Hwy 233, Kemmerer, WY','Opal',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','1-8','LaBarge','LaBarge Town Hall','228 S. LaBarge Street, LaBarge, WY','LaBarge',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','2-9','Cokeville','Cokeville Town Hall','110 Pine Street, Cokeville, WY','Cokeville',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','2-1','Afton','Afton Civic Center','150 S. Washington, Afton, WY','Afton',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','2-2','Afton','Afton Civic Center','150 S. Washington, Afton, WY','Afton',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','2-3','Alpine','Alpine Civic Center','121 Hwy 89, Alpine, WY','Alpine',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','2-4','Bedford','Thayne Community Center','250 Vannoy Parkway, Thayne, WY','Bedford',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','2-5','Etna','Star Valley Community Complex','107736 N US 89, Etna, WY','Etna',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','2-5','Freedom','Star Valley Community Complex','107736 N US 89, Etna, WY','Freedom',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','2-6','Grover','Afton Civic Center','150 S. Washington, Afton, WY','Grover',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','2-6','Auburn','Afton Civic Center','150 S. Washington, Afton, WY','Auburn',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','2-7','Osmond','Afton Civic Center','150 S. Washington, Afton, WY','Osmond',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','2-7','Fairview','Afton Civic Center','150 S. Washington, Afton, WY','Fairview',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','2-7','Smoot','Afton Civic Center','150 S. Washington, Afton, WY','Smoot',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','2-8','Thayne','Thayne Community Center','250 Vannoy Parkway, Thayne, WY','Thayne',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php'),
  ('Lincoln','2-10','Star Valley Ranch','Star Valley Ranch Town Hall','171 Vista Drive, Star Valley Ranch, WY','Star Valley Ranch',NULL,2026,'https://www.lincolncountywy.gov/government/clerk/elections_voting_information/index.php');

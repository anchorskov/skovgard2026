-- Candidates/db/seed/polling_locations_sheridan_addr_patch.sql
-- Sheridan County address corrections verified by user on 2026-06-20.
-- Source note: current Sheridan County polling page listed city-level addresses only;
-- 2024 county polling PDF supplied the street addresses below.

UPDATE polling_locations
   SET location_name = 'Clearmont Fire Hall (Arvada)',
       address = '124 Main St, Arvada, WY 82831'
 WHERE county = 'Sheridan'
   AND precinct_code = '9-1'
   AND election_year = 2026;

UPDATE polling_locations
   SET address = '1605 Pennsylvania Ave, Clearmont, WY 82835'
 WHERE county = 'Sheridan'
   AND precinct_code = '10-1'
   AND election_year = 2026;

UPDATE polling_locations
   SET address = '314 S 2nd St, Big Horn, WY 82833'
 WHERE county = 'Sheridan'
   AND precinct_code = '12-1'
   AND election_year = 2026;

UPDATE polling_locations
   SET address = '663 Wyarno Rd, Sheridan, WY 82801'
 WHERE county = 'Sheridan'
   AND precinct_code = '16-1'
   AND election_year = 2026;

UPDATE polling_locations
   SET address = '145 Coffeen St, Ranchester, WY 82839'
 WHERE county = 'Sheridan'
   AND precinct_code IN ('17-1', '17-2', '18-1')
   AND election_year = 2026;

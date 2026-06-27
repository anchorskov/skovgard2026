-- Carbon County candidate filing corrections.
-- Source file: C:\Users\ancho\Downloads\2026 Primary Candidate Filing_202606050831332771 carbon county.pdf
-- PDF report timestamp: 2026-06-05 07:30.
-- Idempotent: fixes the page-3 Hanna Council continuation rows without duplicating candidates.

BEGIN TRANSACTION;

INSERT OR IGNORE INTO offices (
  title, level, district, sort_order, county, municipality, ballot_party,
  seats_available, scope_kind, contest_type, ward, external_race_id
) VALUES (
  'Town of Hanna Council', 'city', NULL, 31, 'Carbon', 'Hanna', 'NP',
  2, 'municipal', 'candidate_race', NULL, 'carbon-town-of-hanna-council'
);

UPDATE offices
   SET level = 'city',
       sort_order = 31,
       county = 'Carbon',
       municipality = 'Hanna',
       ballot_party = 'NP',
       seats_available = 2,
       scope_kind = 'municipal',
       contest_type = 'candidate_race',
       ward = NULL
 WHERE external_race_id = 'carbon-town-of-hanna-council';

-- If these candidates exist under the bad placeholder precinct offices, move them.
UPDATE candidates
   SET office_id = (SELECT id FROM offices WHERE external_race_id = 'carbon-town-of-hanna-council'),
       party = 'NP',
       slug = 'timothy-c-born-hanna-council',
       city = 'Hanna',
       state = 'WY',
       zip = '82327',
       mailing_address = 'P.O. Box 181, Hanna, WY 82327',
       phone = NULL,
       email = 'tim.born@rocketmail.com',
       source_page = 3,
       external_candidate_id = 'carbon-2026-carbon-town-of-hanna-council-timothy-c-born',
       ballot_name = NULL,
       committee_gender = NULL,
       position_title = 'Town of Hanna Council',
       updated_at = datetime('now')
 WHERE external_candidate_id = 'carbon-2026-carbon-democratic-precinct-committeeman-unknown-timothy-c-born'
   AND NOT EXISTS (
     SELECT 1 FROM candidates
      WHERE external_candidate_id = 'carbon-2026-carbon-town-of-hanna-council-timothy-c-born'
   );

UPDATE candidates
   SET office_id = (SELECT id FROM offices WHERE external_race_id = 'carbon-town-of-hanna-council'),
       party = 'NP',
       slug = 'marcia-beals-hanna-council',
       city = 'Hanna',
       state = 'WY',
       zip = '82327',
       mailing_address = '1014 Feldspar Ct. Hanna, WY 82327',
       phone = NULL,
       email = 'mbeals@union-tel.com',
       source_page = 3,
       external_candidate_id = 'carbon-2026-carbon-town-of-hanna-council-marcia-beals',
       ballot_name = NULL,
       committee_gender = NULL,
       position_title = 'Town of Hanna Council',
       updated_at = datetime('now')
 WHERE external_candidate_id = 'carbon-2026-carbon-democratic-precinct-committeewoman-unknown-marcia-beals'
   AND NOT EXISTS (
     SELECT 1 FROM candidates
      WHERE external_candidate_id = 'carbon-2026-carbon-town-of-hanna-council-marcia-beals'
   );

-- If a correct row already existed, remove the duplicate bad placeholder row.
DELETE FROM candidates
 WHERE external_candidate_id = 'carbon-2026-carbon-democratic-precinct-committeeman-unknown-timothy-c-born'
   AND EXISTS (
     SELECT 1 FROM candidates
      WHERE external_candidate_id = 'carbon-2026-carbon-town-of-hanna-council-timothy-c-born'
   );

DELETE FROM candidates
 WHERE external_candidate_id = 'carbon-2026-carbon-democratic-precinct-committeewoman-unknown-marcia-beals'
   AND EXISTS (
     SELECT 1 FROM candidates
      WHERE external_candidate_id = 'carbon-2026-carbon-town-of-hanna-council-marcia-beals'
   );

-- Seed the correct rows when applying to a database that has the office but not these candidates.
INSERT OR IGNORE INTO candidates (
  office_id, party, full_name, slug, city, state, zip, mailing_address, phone,
  email, source_page, external_candidate_id, ballot_name, committee_gender, position_title
)
SELECT id, 'NP', 'Timothy C. Born', 'timothy-c-born-hanna-council', 'Hanna', 'WY', '82327',
       'P.O. Box 181, Hanna, WY 82327', NULL, 'tim.born@rocketmail.com', 3,
       'carbon-2026-carbon-town-of-hanna-council-timothy-c-born', NULL, NULL, 'Town of Hanna Council'
  FROM offices
 WHERE external_race_id = 'carbon-town-of-hanna-council';

INSERT OR IGNORE INTO candidates (
  office_id, party, full_name, slug, city, state, zip, mailing_address, phone,
  email, source_page, external_candidate_id, ballot_name, committee_gender, position_title
)
SELECT id, 'NP', 'Marcia Beals', 'marcia-beals-hanna-council', 'Hanna', 'WY', '82327',
       '1014 Feldspar Ct. Hanna, WY 82327', NULL, 'mbeals@union-tel.com', 3,
       'carbon-2026-carbon-town-of-hanna-council-marcia-beals', NULL, NULL, 'Town of Hanna Council'
  FROM offices
 WHERE external_race_id = 'carbon-town-of-hanna-council';

DELETE FROM offices
 WHERE external_race_id IN (
   'carbon-carbon-democratic-precinct-committeeman-precinct-unknown-democratic',
   'carbon-carbon-democratic-precinct-committeewoman-precinct-unknown-democratic'
 )
   AND id NOT IN (SELECT DISTINCT office_id FROM candidates WHERE office_id IS NOT NULL);

COMMIT;

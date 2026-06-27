-- Corrective inserts for Johnson County offices that failed in
-- johnson_county_candidates_2026-06-27.sql due to invalid `level` values.
-- Root cause: level CHECK constraint only allows
--   'federal','statewide','wy_senate','wy_house','county','city'
-- Fix: 'municipal' → 'city'
--
-- HD 40 note: a 'Wyoming State Representative HD 40' office was briefly created
-- (ID 1461) but deleted. Connolly and Jones already exist in the canonical
-- office title='State Representative', district=40 (office id 64). No inserts needed.
-- The duplicate candidates (IDs 2933, 2934) were also deleted.

-- Buffalo municipal offices
INSERT OR IGNORE INTO offices (title, level, district, sort_order, county, municipality, seats_available, ballot_party)
  VALUES ('Buffalo Mayor', 'city', NULL, 471, 'Johnson', 'Buffalo', 1, 'NP');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, county, municipality, seats_available, ballot_party)
  VALUES ('Buffalo City Council', 'city', NULL, 472, 'Johnson', 'Buffalo', 2, 'NP');

-- Candidates for Buffalo offices
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'NP', 'Shane James Schrader', 'shane-james-schrader-buffalo-mayor',
    'Buffalo', 'WY', '329 N Adams Buffalo WY 82834', 'mayorofbuffalowy@gmail.com'
  FROM offices WHERE title = 'Buffalo Mayor';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'NP', 'Dylan Sparks', 'dylan-sparks-buffalo-mayor',
    'Buffalo', 'WY', '830 N Desmet Ave Buffalo WY 82834', 'dielonsparks@gmail.com'
  FROM offices WHERE title = 'Buffalo Mayor';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'NP', 'Bob Hancock', 'bob-hancock-buffalo-mayor',
    'Buffalo', 'WY', '264 W Gatchell St Buffalo WY 82834', 'rjmegg4994@gmail.com'
  FROM offices WHERE title = 'Buffalo Mayor';

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'NP', 'Myra Camino', 'myra-camino-buffalo-city-council',
    'Buffalo', 'WY', '655 N Lobban Buffalo WY 82834', 'mycamino@gmail.com'
  FROM offices WHERE title = 'Buffalo City Council';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'NP', 'Craig Rucki', 'craig-rucki-buffalo-city-council',
    'Buffalo', 'WY', '838 Fort St Buffalo WY 82834', 'mcr8221@gmail.com'
  FROM offices WHERE title = 'Buffalo City Council';

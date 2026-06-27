-- Johnson County candidates from official county distribution documents dated 2026-06-22.
-- Sources:
--   Candidate List_County_City_State_for Distribution06222026.pdf
--   Precinct Committee Candidates for Distribution06222026.pdf
-- Received: 2026-06-27. Idempotent: INSERT OR IGNORE throughout.
-- Shane F. Greet (Sheriff) marked withdrawn per "** withdrawn 6/16/2026" notation.
-- sort_order resumes at 463 (max was 462 before this file).

-- ══════════════════════════════════════════════════════════════════════════════
-- COUNTY OFFICES
-- ══════════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO offices (title, level, district, sort_order, county, seats_available, ballot_party)
  VALUES ('Johnson County Commissioner', 'county', NULL, 463, 'Johnson', 2, 'NP');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, county, seats_available, ballot_party)
  VALUES ('Johnson County Coroner', 'county', NULL, 464, 'Johnson', 1, 'NP');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, county, seats_available, ballot_party)
  VALUES ('Johnson County Attorney', 'county', NULL, 465, 'Johnson', 1, 'NP');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, county, seats_available, ballot_party)
  VALUES ('Johnson County Sheriff', 'county', NULL, 466, 'Johnson', 1, 'NP');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, county, seats_available, ballot_party)
  VALUES ('Johnson County Clerk', 'county', NULL, 467, 'Johnson', 1, 'NP');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, county, seats_available, ballot_party)
  VALUES ('Johnson County Treasurer', 'county', NULL, 468, 'Johnson', 1, 'NP');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, county, seats_available, ballot_party)
  VALUES ('Johnson County Assessor', 'county', NULL, 469, 'Johnson', 1, 'NP');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, county, seats_available, ballot_party)
  VALUES ('Johnson County Clerk of District Court', 'county', NULL, 470, 'Johnson', 1, 'NP');

-- County Commissioner (2 seats)
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Jeff Shelley', 'jeff-shelley-johnson-county-commissioner',
    'Buffalo', 'WY', '75 Meadowview Dr Buffalo WY 82834', NULL
  FROM offices WHERE title = 'Johnson County Commissioner';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Bill Novotny', 'bill-novotny-johnson-county-commissioner',
    'Buffalo', 'WY', '429 N Carrington Ave Buffalo WY 82834', 'bill.novotny@gmail.com'
  FROM offices WHERE title = 'Johnson County Commissioner';

-- Coroner
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Shawn M. Sullivan', 'shawn-m-sullivan-johnson-county-coroner',
    'Buffalo', 'WY', '243 Sunset Ave Buffalo WY 82834', 'sully755@hotmail.com'
  FROM offices WHERE title = 'Johnson County Coroner';

-- Attorney
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Tucker J. Ruby', 'tucker-j-ruby-johnson-county-attorney',
    'Banner', 'WY', '4400 US HWY 87 Banner WY 82832', 'tuckruby@gmail.com'
  FROM offices WHERE title = 'Johnson County Attorney';

-- Sheriff (Greet withdrawn 6/16/2026)
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Shane F. Greet', 'shane-f-greet-johnson-county-sheriff',
    'Kaycee', 'WY', '80 Sussex Rd Kaycee WY 82639', 'shane@shanegreet4sheriff.com'
  FROM offices WHERE title = 'Johnson County Sheriff';
UPDATE candidates SET withdrawn_at = '2026-06-16T00:00:00'
  WHERE slug = 'shane-f-greet-johnson-county-sheriff' AND withdrawn_at IS NULL;

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Adrian Keeler', 'adrian-keeler-johnson-county-sheriff',
    'Buffalo', 'WY', '140 W Gatchell St Buffalo WY 82834', NULL
  FROM offices WHERE title = 'Johnson County Sheriff';

-- Clerk
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Becky Rodriguez', 'becky-rodriguez-johnson-county-clerk',
    'Buffalo', 'WY', '777 US Hwy 16 E Buffalo WY 82834', NULL
  FROM offices WHERE title = 'Johnson County Clerk';

-- Treasurer
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Brittnee Borgialli', 'brittnee-borgialli-johnson-county-treasurer',
    'Buffalo', 'WY', '297 N Carrington Ave Buffalo WY 82834', 'borgialli4jctwyo@gmail.com'
  FROM offices WHERE title = 'Johnson County Treasurer';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Darcy Goni', 'darcy-goni-johnson-county-treasurer',
    'Buffalo', 'WY', '29734 Old Hwy 87 Buffalo WY 82834', 'goni4treasurer@gmail.com'
  FROM offices WHERE title = 'Johnson County Treasurer';

-- Assessor
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Stephen Esponda', 'stephen-esponda-johnson-county-assessor',
    'Buffalo', 'WY', '1325 Eagle View Dr Buffalo WY 82834', 'sesponda@live.com'
  FROM offices WHERE title = 'Johnson County Assessor';

-- Clerk of District Court
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Paige Rhoads', 'paige-rhoads-johnson-county-clerk-district-court',
    'Buffalo', 'WY', '16 Park Ln Buffalo WY 82834', 'paigerhoads23@gmail.com'
  FROM offices WHERE title = 'Johnson County Clerk of District Court';

-- ══════════════════════════════════════════════════════════════════════════════
-- BUFFALO MUNICIPAL OFFICES
-- ══════════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO offices (title, level, district, sort_order, county, municipality, seats_available, ballot_party)
  VALUES ('Buffalo Mayor', 'city', NULL, 471, 'Johnson', 'Buffalo', 1, 'NP');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, county, municipality, seats_available, ballot_party)
  VALUES ('Buffalo City Council', 'city', NULL, 472, 'Johnson', 'Buffalo', 2, 'NP');

-- Mayor
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

-- City Council (2 seats)
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'NP', 'Myra Camino', 'myra-camino-buffalo-city-council',
    'Buffalo', 'WY', '655 N Lobban Buffalo WY 82834', 'mycamino@gmail.com'
  FROM offices WHERE title = 'Buffalo City Council';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'NP', 'Craig Rucki', 'craig-rucki-buffalo-city-council',
    'Buffalo', 'WY', '838 Fort St Buffalo WY 82834', 'mcr8221@gmail.com'
  FROM offices WHERE title = 'Buffalo City Council';

-- ══════════════════════════════════════════════════════════════════════════════
-- STATE LEGISLATIVE — HD 40
-- ══════════════════════════════════════════════════════════════════════════════
-- HD 40 (Johnson County) candidates Marilyn Connolly and Mark Jones already
-- exist in the canonical office: title='State Representative', level='wy_house',
-- district=40 (office id 64, county=NULL). No new office or candidates needed.
-- sort_order 473 was reserved but not used.

-- ══════════════════════════════════════════════════════════════════════════════
-- JOHNSON COUNTY PRECINCT COMMITTEE OFFICES AND CANDIDATES
-- ══════════════════════════════════════════════════════════════════════════════
-- Only offices with at least one candidate are created.
-- Precincts 4-7 and 4-8 have 3 Republican seats (M and F separately).
-- Precinct 3-7 and 6-10 had no filings — omitted.

-- Precinct 3-1 (all four slots filled)
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-1 Republican Precinct Committeeman', 'county', NULL, 474, '3-1', 'Johnson', 'precinct_party_gender');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-1 Republican Precinct Committeewoman', 'county', NULL, 475, '3-1', 'Johnson', 'precinct_party_gender');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-1 Democratic Precinct Committeeman', 'county', NULL, 476, '3-1', 'Johnson', 'precinct_party_gender');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-1 Democratic Precinct Committeewoman', 'county', NULL, 477, '3-1', 'Johnson', 'precinct_party_gender');

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Theo Hirshfeld', 'johnson-pct-3-1-rep-man-theo-hirshfeld',
    'Buffalo', 'WY', '797 Northridge Way Buffalo WY 82834', 'tbhapp@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 3-1 Republican Precinct Committeeman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Marilyn F. Connolly', 'johnson-pct-3-1-rep-woman-marilyn-f-connolly',
    'Buffalo', 'WY', '859 N Desmet Ave Buffalo WY 82834', NULL
  FROM offices WHERE title = 'Johnson Precinct 3-1 Republican Precinct Committeewoman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'DEM', 'Ted Lapis', 'johnson-pct-3-1-dem-man-ted-lapis',
    'Buffalo', 'WY', '565 N Carrington Ave Buffalo WY 82834', 'ted.lapis@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 3-1 Democratic Precinct Committeeman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'DEM', 'Lois Petersen', 'johnson-pct-3-1-dem-woman-lois-petersen',
    'Buffalo', 'WY', '1197 N Burritt Ave Buffalo WY 82834', 'lois.petersen@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 3-1 Democratic Precinct Committeewoman';

-- Precinct 3-2
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-2 Republican Precinct Committeeman', 'county', NULL, 478, '3-2', 'Johnson', 'precinct_party_gender');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-2 Republican Precinct Committeewoman', 'county', NULL, 479, '3-2', 'Johnson', 'precinct_party_gender');

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Bill Novotny', 'johnson-pct-3-2-rep-man-bill-novotny',
    'Buffalo', 'WY', '429 N Carrington Ave Buffalo WY 82834', 'bill.novotny@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 3-2 Republican Precinct Committeeman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Brittnee Borgialli', 'johnson-pct-3-2-rep-woman-brittnee-borgialli',
    'Buffalo', 'WY', '297 N Carrington Ave Buffalo WY 82834', 'brittneeborgialli@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 3-2 Republican Precinct Committeewoman';

-- Precinct 3-3
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-3 Republican Precinct Committeeman', 'county', NULL, 480, '3-3', 'Johnson', 'precinct_party_gender');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-3 Republican Precinct Committeewoman', 'county', NULL, 481, '3-3', 'Johnson', 'precinct_party_gender');

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Norman Lee Sanford', 'johnson-pct-3-3-rep-man-norman-lee-sanford',
    'Buffalo', 'WY', '458 N Main St Buffalo WY 82834', 'nleesandford@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 3-3 Republican Precinct Committeeman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Edith L. Taffner', 'johnson-pct-3-3-rep-woman-edith-l-taffner',
    'Buffalo', 'WY', '303 N Lobban Ave Buffalo WY 82834', NULL
  FROM offices WHERE title = 'Johnson Precinct 3-3 Republican Precinct Committeewoman';

-- Precinct 3-4
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-4 Republican Precinct Committeeman', 'county', NULL, 482, '3-4', 'Johnson', 'precinct_party_gender');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-4 Republican Precinct Committeewoman', 'county', NULL, 483, '3-4', 'Johnson', 'precinct_party_gender');

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'James Waller', 'johnson-pct-3-4-rep-man-james-waller',
    'Buffalo', 'WY', '330 S Main St Buffalo WY 82834', 'vandehei2000@yahoo.com'
  FROM offices WHERE title = 'Johnson Precinct 3-4 Republican Precinct Committeeman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Lisa Griffith', 'johnson-pct-3-4-rep-woman-lisa-griffith',
    'Buffalo', 'WY', '175 W Gatchell Buffalo WY 82834', 'lisa.griffith55@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 3-4 Republican Precinct Committeewoman';

-- Precinct 3-5
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-5 Republican Precinct Committeeman', 'county', NULL, 484, '3-5', 'Johnson', 'precinct_party_gender');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-5 Republican Precinct Committeewoman', 'county', NULL, 485, '3-5', 'Johnson', 'precinct_party_gender');

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Randolph Moses', 'johnson-pct-3-5-rep-man-randolph-moses',
    'Buffalo', 'WY', '150 N Tisdale Ave Buffalo WY 82834', NULL
  FROM offices WHERE title = 'Johnson Precinct 3-5 Republican Precinct Committeeman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'JoAnn H. Pearson', 'johnson-pct-3-5-rep-woman-joann-h-pearson',
    'Buffalo', 'WY', '190 N Tisdale Ave Buffalo WY 82834', 'joannpwyo@outlook.com'
  FROM offices WHERE title = 'Johnson Precinct 3-5 Republican Precinct Committeewoman';

-- Precinct 3-6
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-6 Republican Precinct Committeeman', 'county', NULL, 486, '3-6', 'Johnson', 'precinct_party_gender');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-6 Republican Precinct Committeewoman', 'county', NULL, 487, '3-6', 'Johnson', 'precinct_party_gender');

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Barry Crago', 'johnson-pct-3-6-rep-man-barry-crago',
    'Buffalo', 'WY', '443 S Lobban Ave Buffalo WY 82834', NULL
  FROM offices WHERE title = 'Johnson Precinct 3-6 Republican Precinct Committeeman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Kristen V. Crago', 'johnson-pct-3-6-rep-woman-kristen-v-crago',
    'Buffalo', 'WY', '443 S Lobban Ave Buffalo WY 82834', 'kristen@willowcreekranch.com'
  FROM offices WHERE title = 'Johnson Precinct 3-6 Republican Precinct Committeewoman';

-- Precinct 3-8
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-8 Republican Precinct Committeeman', 'county', NULL, 488, '3-8', 'Johnson', 'precinct_party_gender');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 3-8 Republican Precinct Committeewoman', 'county', NULL, 489, '3-8', 'Johnson', 'precinct_party_gender');

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'John N. Thorburn', 'johnson-pct-3-8-rep-man-john-n-thorburn',
    'Buffalo', 'WY', '655 Melody St Buffalo WY 82834', 'jn.thorburn11@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 3-8 Republican Precinct Committeeman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Cheryl Benner', 'johnson-pct-3-8-rep-woman-cheryl-benner',
    'Buffalo', 'WY', '511 S Lucas St Buffalo WY 82834', 'benner82834@yahoo.com'
  FROM offices WHERE title = 'Johnson Precinct 3-8 Republican Precinct Committeewoman';

-- Precinct 4-7 (3 REP M seats, 3 REP F seats — 4 filed for each)
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, seats_available, scope_kind)
  VALUES ('Johnson Precinct 4-7 Republican Precinct Committeeman', 'county', NULL, 490, '4-7', 'Johnson', 3, 'precinct_party_gender');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, seats_available, scope_kind)
  VALUES ('Johnson Precinct 4-7 Republican Precinct Committeewoman', 'county', NULL, 491, '4-7', 'Johnson', 3, 'precinct_party_gender');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 4-7 Democratic Precinct Committeeman', 'county', NULL, 492, '4-7', 'Johnson', 'precinct_party_gender');

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Ben Schiffer', 'johnson-pct-4-7-rep-man-ben-schiffer',
    'Buffalo', 'WY', '34 Mountain View Buffalo WY 82834', 'bschiffer@wwcengineering.com'
  FROM offices WHERE title = 'Johnson Precinct 4-7 Republican Precinct Committeeman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Garrett Whitney Lindemann', 'johnson-pct-4-7-rep-man-garrett-whitney-lindemann',
    'Buffalo', 'WY', '25 Bethel Rd #7 Buffalo WY 82834', 'gwlindemann@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 4-7 Republican Precinct Committeeman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Peter John Camino', 'johnson-pct-4-7-rep-man-peter-john-camino',
    'Buffalo', 'WY', '29257 Old Hwy 87 Buffalo WY 82834', 'pjcamin@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 4-7 Republican Precinct Committeeman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'James A. Gampetro', 'johnson-pct-4-7-rep-man-james-a-gampetro',
    'Buffalo', 'WY', '18 Shady Lane Buffalo WY 82834', NULL
  FROM offices WHERE title = 'Johnson Precinct 4-7 Republican Precinct Committeeman';

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Marilyn J. Novotny', 'johnson-pct-4-7-rep-woman-marilyn-j-novotny',
    'Buffalo', 'WY', '21 Twin Lakes Ln Buffalo WY 82834', 'b4unovotny@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 4-7 Republican Precinct Committeewoman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Laci C. Schiffer', 'johnson-pct-4-7-rep-woman-laci-c-schiffer',
    'Buffalo', 'WY', '34 Mt View Buffalo WY 82834', 'lschiffer5@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 4-7 Republican Precinct Committeewoman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Darcy Goni', 'johnson-pct-4-7-rep-woman-darcy-goni',
    'Buffalo', 'WY', '29734 Old Hwy 87 Buffalo WY 82834', 'darcyrgoni@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 4-7 Republican Precinct Committeewoman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Jackie Camino', 'johnson-pct-4-7-rep-woman-jackie-camino',
    'Buffalo', 'WY', '29257 Old Hwy 87 Buffalo WY 82834', NULL
  FROM offices WHERE title = 'Johnson Precinct 4-7 Republican Precinct Committeewoman';

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'DEM', 'Dudley Case', 'johnson-pct-4-7-dem-man-dudley-case',
    'Buffalo', 'WY', '24 Shady Ln Buffalo WY 82834', 'md_case@mac.com'
  FROM offices WHERE title = 'Johnson Precinct 4-7 Democratic Precinct Committeeman';

-- Precinct 4-8 (3 REP M seats, 3 REP F seats — 4 filed M, 4 filed F, 1 DEM F)
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, seats_available, scope_kind)
  VALUES ('Johnson Precinct 4-8 Republican Precinct Committeeman', 'county', NULL, 493, '4-8', 'Johnson', 3, 'precinct_party_gender');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, seats_available, scope_kind)
  VALUES ('Johnson Precinct 4-8 Republican Precinct Committeewoman', 'county', NULL, 494, '4-8', 'Johnson', 3, 'precinct_party_gender');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 4-8 Democratic Precinct Committeewoman', 'county', NULL, 495, '4-8', 'Johnson', 'precinct_party_gender');

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'John DeMatteis', 'johnson-pct-4-8-rep-man-john-dematteis',
    'Buffalo', 'WY', '8465 Hwy 16 W Buffalo WY 82834', 'john.dematteis@yahoo.com'
  FROM offices WHERE title = 'Johnson Precinct 4-8 Republican Precinct Committeeman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Steven R. Laird', 'johnson-pct-4-8-rep-man-steven-r-laird',
    'Buffalo', 'WY', '585 Rock Creek Road Buffalo WY 82834', 'laird.steve@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 4-8 Republican Precinct Committeeman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Zane Hengel', 'johnson-pct-4-8-rep-man-zane-hengel',
    'Buffalo', 'WY', '14 Westwind Dr Buffalo WY 82834', 'zane@cragolawoffices.com'
  FROM offices WHERE title = 'Johnson Precinct 4-8 Republican Precinct Committeeman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Luke A. Goddard', 'johnson-pct-4-8-rep-man-luke-a-goddard',
    'Buffalo', 'WY', '232 French Creek Road Buffalo WY 82834', 'luke.a.goddard@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 4-8 Republican Precinct Committeeman';

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Laura J. DeMatteis', 'johnson-pct-4-8-rep-woman-laura-j-dematteis',
    'Buffalo', 'WY', '8465 Hwy 16 W Buffalo WY 82834', NULL
  FROM offices WHERE title = 'Johnson Precinct 4-8 Republican Precinct Committeewoman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Carla Bishop', 'johnson-pct-4-8-rep-woman-carla-bishop',
    'Buffalo', 'WY', '303 Rock Creek Road Buffalo WY 82834', NULL
  FROM offices WHERE title = 'Johnson Precinct 4-8 Republican Precinct Committeewoman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Marcia Goddard', 'johnson-pct-4-8-rep-woman-marcia-goddard',
    'Buffalo', 'WY', '232 French Creek Road Buffalo WY 82834', 'mraegoddard@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 4-8 Republican Precinct Committeewoman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Celeste Besel', 'johnson-pct-4-8-rep-woman-celeste-besel',
    'Buffalo', 'WY', '802 Birch Street Buffalo WY 82834', NULL
  FROM offices WHERE title = 'Johnson Precinct 4-8 Republican Precinct Committeewoman';

-- Kim McCoy email in source PDF has a space ("tortoise kim@icloud.com") — stored NULL pending correction
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'DEM', 'Kim McCoy', 'johnson-pct-4-8-dem-woman-kim-mccoy',
    'Buffalo', 'WY', '21 Deer Haven Dr Buffalo WY 82834', NULL
  FROM offices WHERE title = 'Johnson Precinct 4-8 Democratic Precinct Committeewoman';

-- Precinct 5-9
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 5-9 Republican Precinct Committeeman', 'county', NULL, 496, '5-9', 'Johnson', 'precinct_party_gender');
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 5-9 Republican Precinct Committeewoman', 'county', NULL, 497, '5-9', 'Johnson', 'precinct_party_gender');

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'James R. Purdy', 'johnson-pct-5-9-rep-man-james-r-purdy',
    'Buffalo', 'WY', '384 Billy Creek Buffalo WY 82834', 'jpurdywy@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 5-9 Republican Precinct Committeeman';
INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Jenny Wuerker', 'johnson-pct-5-9-rep-woman-jenny-wuerker',
    'Buffalo', 'WY', '162 Little Crazy Woman Rd Buffalo WY 82834', 'jennywuerker@gmail.com'
  FROM offices WHERE title = 'Johnson Precinct 5-9 Republican Precinct Committeewoman';

-- Precinct 8-11
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 8-11 Republican Precinct Committeeman', 'county', NULL, 498, '8-11', 'Johnson', 'precinct_party_gender');

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Nathan Williams', 'johnson-pct-8-11-rep-man-nathan-williams',
    'Kaycee', 'WY', '264 EK Mtn Rd Kaycee WY 82639', 'nate@rtconnect.net'
  FROM offices WHERE title = 'Johnson Precinct 8-11 Republican Precinct Committeeman';

-- Precinct 9-12
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 9-12 Republican Precinct Committeewoman', 'county', NULL, 499, '9-12', 'Johnson', 'precinct_party_gender');

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Sherryl Fraker', 'johnson-pct-9-12-rep-woman-sherryl-fraker',
    'Kaycee', 'WY', '1907 Sussex Rd Kaycee WY 82639', NULL
  FROM offices WHERE title = 'Johnson Precinct 9-12 Republican Precinct Committeewoman';

-- Precinct 10-15
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 10-15 Democratic Precinct Committeewoman', 'county', NULL, 500, '10-15', 'Johnson', 'precinct_party_gender');

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'DEM', 'Linda Kreider Wilson', 'johnson-pct-10-15-dem-woman-linda-kreider-wilson',
    'Buffalo', 'WY', '760 TW Rd Buffalo WY 82834', 'lindakwilson@att.net'
  FROM offices WHERE title = 'Johnson Precinct 10-15 Democratic Precinct Committeewoman';

-- Precinct 2-14
INSERT OR IGNORE INTO offices (title, level, district, sort_order, precinct_code, county, scope_kind)
  VALUES ('Johnson Precinct 2-14 Republican Precinct Committeeman', 'county', NULL, 501, '2-14', 'Johnson', 'precinct_party_gender');

INSERT OR IGNORE INTO candidates (office_id, party, full_name, slug, city, state, mailing_address, email)
  SELECT id, 'REP', 'Travis D. Pearson', 'johnson-pct-2-14-rep-man-travis-d-pearson',
    'Buffalo', 'WY', '395 Lake Ridge Rd Buffalo WY 82834', NULL
  FROM offices WHERE title = 'Johnson Precinct 2-14 Republican Precinct Committeeman';

-- Weston County 2026 primary candidates from the News Letter Journal filing-close report.
-- User authorized proceeding with the secondary source because no official county candidate file is available.
-- Party clarification: all county and precinct candidates filed Republican; no Democratic precinct filings reported.
-- State legislative candidates are intentionally excluded because they already exist in canonical district offices.
-- County Commissioner and Newcastle City Council each have 3 seats; precinct committee offices default to 1 seat.
-- Official-office contacts are retained only in enrichment_notes and are not published as candidate contacts.
-- Generated from Candidates/_research/weston_county_candidate_staging_2026-07-03.csv.
-- Idempotency: office inserts use explicit NOT EXISTS; candidate inserts rely on unique slugs.
-- Expected inserts on a clean Weston seed: 26 offices + 62 candidates = 88 rows.
-- The scoped office metadata correction keeps partisan race filtering aligned with the candidate party.

-- Offices (sort_order 502-527)
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston County Commissioner', 'county', NULL, 502, NULL, 'Weston', NULL, 3, 'NP', NULL
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston County Commissioner' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston County Sheriff', 'county', NULL, 503, NULL, 'Weston', NULL, 1, 'NP', NULL
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston County Sheriff' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston County Clerk', 'county', NULL, 504, NULL, 'Weston', NULL, 1, 'NP', NULL
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston County Clerk' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston County Clerk of District Court', 'county', NULL, 505, NULL, 'Weston', NULL, 1, 'NP', NULL
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston County Clerk of District Court' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston County Assessor', 'county', NULL, 506, NULL, 'Weston', NULL, 1, 'NP', NULL
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston County Assessor' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston County Coroner', 'county', NULL, 507, NULL, 'Weston', NULL, 1, 'NP', NULL
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston County Coroner' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston County Treasurer', 'county', NULL, 508, NULL, 'Weston', NULL, 1, 'NP', NULL
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston County Treasurer' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston County Attorney', 'county', NULL, 509, NULL, 'Weston', NULL, 1, 'NP', NULL
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston County Attorney' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Newcastle City Council', 'city', NULL, 510, NULL, 'Weston', 'Newcastle', 3, 'NP', NULL
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Newcastle City Council' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 1-1 Republican Precinct Committeeman', 'county', NULL, 511, '1-1', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 1-1 Republican Precinct Committeeman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 1-1 Republican Precinct Committeewoman', 'county', NULL, 512, '1-1', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 1-1 Republican Precinct Committeewoman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 1-2 Republican Precinct Committeeman', 'county', NULL, 513, '1-2', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 1-2 Republican Precinct Committeeman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 1-2 Republican Precinct Committeewoman', 'county', NULL, 514, '1-2', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 1-2 Republican Precinct Committeewoman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 2-1 Republican Precinct Committeeman', 'county', NULL, 515, '2-1', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 2-1 Republican Precinct Committeeman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 2-1 Republican Precinct Committeewoman', 'county', NULL, 516, '2-1', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 2-1 Republican Precinct Committeewoman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 3-1 Republican Precinct Committeeman', 'county', NULL, 517, '3-1', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 3-1 Republican Precinct Committeeman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 3-1 Republican Precinct Committeewoman', 'county', NULL, 518, '3-1', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 3-1 Republican Precinct Committeewoman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 3-2 Republican Precinct Committeewoman', 'county', NULL, 519, '3-2', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 3-2 Republican Precinct Committeewoman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 4-1 Republican Precinct Committeeman', 'county', NULL, 520, '4-1', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 4-1 Republican Precinct Committeeman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 4-1 Republican Precinct Committeewoman', 'county', NULL, 521, '4-1', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 4-1 Republican Precinct Committeewoman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 5-1 Republican Precinct Committeeman', 'county', NULL, 522, '5-1', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 5-1 Republican Precinct Committeeman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 5-1 Republican Precinct Committeewoman', 'county', NULL, 523, '5-1', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 5-1 Republican Precinct Committeewoman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 5-2 Republican Precinct Committeeman', 'county', NULL, 524, '5-2', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 5-2 Republican Precinct Committeeman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 5-2 Republican Precinct Committeewoman', 'county', NULL, 525, '5-2', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 5-2 Republican Precinct Committeewoman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 5-3 Republican Precinct Committeeman', 'county', NULL, 526, '5-3', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 5-3 Republican Precinct Committeeman' AND county = 'Weston'
 );
INSERT INTO offices
  (title, level, district, sort_order, precinct_code, county, municipality, seats_available, ballot_party, scope_kind)
SELECT 'Weston Precinct 5-3 Republican Precinct Committeewoman', 'county', NULL, 527, '5-3', 'Weston', NULL, 1, NULL, 'precinct_party_gender'
 WHERE NOT EXISTS (
   SELECT 1 FROM offices WHERE title = 'Weston Precinct 5-3 Republican Precinct Committeewoman' AND county = 'Weston'
 );

-- All reported Weston county and precinct candidates filed Republican.
-- Newcastle City Council is intentionally excluded and remains nonpartisan.
UPDATE offices
   SET ballot_party = 'REP'
 WHERE county = 'Weston'
   AND (title LIKE 'Weston County %' OR scope_kind = 'precinct_party_gender');

-- Candidates

INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Nathan Todd', 'nathan-todd-weston-county-commissioner', NULL, 'WY',
       NULL, NULL, NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: official_office_only; official_office_email: ntodd@westongov.com (not campaign contact); website_status: official_commissioner_page_reported_url_required.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Commissioner' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Vera Huber', 'vera-huber-weston-county-commissioner', NULL, 'WY',
       NULL, 'vhuberwyo@gmail.com', NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: older_public_verify_before_outreach; official_office_email: vhuber@westongov.com (not campaign contact); website_status: older_candidate_profile_reported_url_required.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Commissioner' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Garrett Borton', 'garrett-borton-weston-county-commissioner', NULL, 'WY',
       NULL, 'commissionerborton@yahoo.com', NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: older_candidate_source_verify_before_outreach; website_status: older_candidate_profile_reported_url_required.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Commissioner' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Don Taylor', 'don-taylor-weston-county-commissioner', NULL, 'WY',
       NULL, NULL, NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_verified_contact; website_status: county_candidate_profile_reported_url_required.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Commissioner' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Allen Slagle', 'allen-slagle-weston-county-commissioner', NULL, 'WY',
       '307-746-2804', 'info@allenslagleforhd2.com', NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: legacy_campaign_verify_before_outreach; website_status: legacy_campaign_site_reported_url_required.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Commissioner' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'F. Henry Nessul', 'f-henry-nessul-weston-county-commissioner', NULL, 'WY',
       NULL, NULL, NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_verified_contact; website_status: county_candidate_profile_reported_url_required.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Commissioner' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Gillian A. Sears', 'gillian-a-sears-weston-county-commissioner', NULL, 'WY',
       NULL, NULL, NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_verified_contact; website_status: facebook_campaign_page_reported_url_required.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Commissioner' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Bryan Colvard', 'bryan-colvard-weston-county-sheriff', NULL, 'WY',
       '307-746-8046', 'bryanec@rtconnect.net', NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: older_candidate_source_verify_before_outreach; official_office_phone: 307-746-4441 (not campaign contact); website_status: official_sheriff_page_and_older_candidate_profile_reported_urls_required.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Sheriff' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Susan Bridge', 'susan-bridge-weston-county-sheriff', NULL, 'WY',
       NULL, NULL, NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_verified_contact; website_status: campaign_site_reported_url_required.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Sheriff' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Amber Green', 'amber-green-weston-county-clerk', NULL, 'WY',
       NULL, NULL, NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: official_office_stale_role_verify; official_office_phone: 307-746-4744 (not campaign contact); website_status: official_county_clerk_page_reported_url_required.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Clerk' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Mike Tooman', 'mike-tooman-weston-county-clerk', NULL, 'WY',
       NULL, NULL, NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_verified_contact; website_status: no_verified_campaign_site.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Clerk' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Riki Kaiser', 'riki-kaiser-weston-county-clerk-district-court', NULL, 'WY',
       NULL, NULL, NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: official_office_only; official_office_phone: 307-746-4778 (not campaign contact); website_status: official_clerk_district_court_page_reported_url_required.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Clerk of District Court' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Kara Lenardson', 'kara-lenardson-weston-county-assessor', NULL, 'WY',
       NULL, NULL, NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: official_office_only; official_office_phone: 307-746-4633 (not campaign contact); website_status: official_assessor_page_reported_url_required.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Assessor' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Scott E. Beachler', 'scott-e-beachler-weston-county-coroner', NULL, 'WY',
       '307-746-5610', 'sbnwy@outlook.com', NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: older_public_email_verify_before_outreach; official_office_phone: 307-746-5610 (not campaign contact); website_status: official_coroner_page_and_older_candidate_profile_reported_urls_required.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Coroner' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Susan Overman', 'susan-overman-weston-county-treasurer', NULL, 'WY',
       NULL, 'overmankay55@hotmail.com', NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: older_public_email_verify_before_outreach; official_office_phone: 307-746-2852 (not campaign contact); official_office_email: treasurer@westongov.com (not campaign contact); website_status: official_treasurer_page_and_older_candidate_profile_reported_urls_required.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Treasurer' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Michael Stulken', 'michael-stulken-weston-county-attorney', NULL, 'WY',
       NULL, NULL, NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: official_office_only; official_office_phone: 307-746-9131 (not campaign contact); website_status: official_county_attorney_page_reported_url_required.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston County Attorney' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'NP', 'Don Steveson', 'don-steveson-newcastle-city-council', 'Newcastle', 'WY',
       NULL, NULL, NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_verified_contact; website_status: no_verified_campaign_site.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Newcastle City Council' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'NP', 'John Butts', 'john-butts-newcastle-city-council', 'Newcastle', 'WY',
       NULL, NULL, NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_verified_contact; website_status: no_verified_campaign_site.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Newcastle City Council' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'NP', 'Wyatt Voelker', 'wyatt-voelker-newcastle-city-council', 'Newcastle', 'WY',
       NULL, NULL, NULL, NULL,
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_verified_contact; website_status: no_verified_campaign_site.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Newcastle City Council' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Jon Tidyman', 'weston-pct-1-1-rep-man-jon-tidyman', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-1 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Ted Ertman', 'weston-pct-1-1-rep-man-ted-ertman', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-1 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Kenneth Hoffman', 'weston-pct-1-1-rep-man-kenneth-hoffman', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-1 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Richard Wehri', 'weston-pct-1-1-rep-man-richard-wehri', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-1 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Michael Chad Sears', 'weston-pct-1-1-rep-man-michael-chad-sears', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-1 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Allen Slagle', 'weston-pct-1-1-rep-man-allen-slagle', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-1 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Marty Ertman', 'weston-pct-1-1-rep-woman-marty-ertman', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-1 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Megan Stith', 'weston-pct-1-1-rep-woman-megan-stith', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-1 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Gillian Sears', 'weston-pct-1-1-rep-woman-gillian-sears', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-1 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Ann Slagle', 'weston-pct-1-1-rep-woman-ann-slagle', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-1 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Mike Tooman', 'weston-pct-1-2-rep-man-mike-tooman', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-2 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Edward Wagoner', 'weston-pct-1-2-rep-man-edward-wagoner', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-2 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Tom Wing', 'weston-pct-1-2-rep-man-tom-wing', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-2 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Bill Lambert', 'weston-pct-1-2-rep-man-bill-lambert', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-2 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Karen Drost', 'weston-pct-1-2-rep-woman-karen-drost', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-2 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Jill Pischke', 'weston-pct-1-2-rep-woman-jill-pischke', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-2 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Marcia Lambert', 'weston-pct-1-2-rep-woman-marcia-lambert', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 1-2 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Clay Branscom', 'weston-pct-2-1-rep-man-clay-branscom', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 2-1 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Dean J. Rightnowar', 'weston-pct-2-1-rep-man-dean-j-rightnowar', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 2-1 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Joely Rightnowar', 'weston-pct-2-1-rep-woman-joely-rightnowar', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 2-1 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Charleen Haynes', 'weston-pct-2-1-rep-woman-charleen-haynes', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 2-1 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Curtis Rankin', 'weston-pct-3-1-rep-man-curtis-rankin', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 3-1 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Karol Holland', 'weston-pct-3-1-rep-woman-karol-holland', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 3-1 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Loretta Moyers', 'weston-pct-3-2-rep-woman-loretta-moyers', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 3-2 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Nathan Todd', 'weston-pct-4-1-rep-man-nathan-todd', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 4-1 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Cody Barritt', 'weston-pct-4-1-rep-man-cody-barritt', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 4-1 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Chelsie Todd', 'weston-pct-4-1-rep-woman-chelsie-todd', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 4-1 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Ragina Barritt', 'weston-pct-4-1-rep-woman-ragina-barritt', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 4-1 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Benjamin Roberts', 'weston-pct-5-1-rep-man-benjamin-roberts', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 5-1 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Matt Conzelman', 'weston-pct-5-1-rep-man-matt-conzelman', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 5-1 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Scott Johnson', 'weston-pct-5-1-rep-man-scott-johnson', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 5-1 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Teresa Gross', 'weston-pct-5-1-rep-woman-teresa-gross', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 5-1 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Kim Conzelman', 'weston-pct-5-1-rep-woman-kim-conzelman', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 5-1 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'John Butts', 'weston-pct-5-2-rep-man-john-butts', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 5-2 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Robert W. Akers', 'weston-pct-5-2-rep-man-robert-w-akers', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 5-2 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Joanna L. Akers', 'weston-pct-5-2-rep-woman-joanna-l-akers', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 5-2 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Sue Slagle Mireles', 'weston-pct-5-2-rep-woman-sue-slagle-mireles', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 5-2 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Kolby Pisciotti', 'weston-pct-5-3-rep-man-kolby-pisciotti', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 5-3 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'James Burrough', 'weston-pct-5-3-rep-man-james-burrough', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 5-3 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Jason Jenkins', 'weston-pct-5-3-rep-man-jason-jenkins', NULL, 'WY',
       NULL, NULL, 'M', 'Precinct Committeeman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 5-3 Republican Precinct Committeeman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Suzanne Burrough', 'weston-pct-5-3-rep-woman-suzanne-burrough', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 5-3 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Tanya-Marie Foote', 'weston-pct-5-3-rep-woman-tanya-marie-foote', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 5-3 Republican Precinct Committeewoman' AND county = 'Weston';
INSERT OR IGNORE INTO candidates
  (office_id, party, full_name, slug, city, state, phone, email, committee_gender, position_title,
   data_confidence, human_review_needed, enrichment_notes, enrichment_batch, batch_status)
SELECT id, 'REP', 'Riki Kaiser', 'weston-pct-5-3-rep-woman-riki-kaiser', NULL, 'WY',
       NULL, NULL, 'F', 'Precinct Committeewoman',
       'Medium', 1, 'candidate_source: News Letter Journal filing-close report (secondary source); party_source: News Letter Journal reports Republican filings and no Democratic precinct committee filings; official_verification: no official 2026 Weston candidate file available as of 2026-07-03; contact_status: no_public_contact_found; website_status: no_reliable_public_contact_enrichment_found.', 'weston-county-2026-07-03', 'secondary_source_seeded_pending_official'
  FROM offices WHERE title = 'Weston Precinct 5-3 Republican Precinct Committeewoman' AND county = 'Weston';

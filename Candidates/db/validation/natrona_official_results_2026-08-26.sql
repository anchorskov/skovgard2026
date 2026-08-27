-- Read-only validation for Natrona County's final official 2026 primary load.
-- Target: Candidates local WY_DB after migration 0037 and the two Natrona SQL files.
-- This file contains no updates and does not rely on environment-local IDs.
-- The Python review script and archived seat-review CSV remain authoritative
-- for all 184 printed Vote For values, including the 86 contests with no office.

-- Q01: the exact official source and snapshot.
SELECT
  es.source_key,
  es.source_role,
  es.source_type,
  ess.sha256,
  ess.source_published_at,
  ess.retrieved_at,
  ess.is_unofficial,
  ess.verification_status,
  COUNT(DISTINCT esc.contest_id) AS snapshot_contests,
  COUNT(rr.id) AS result_rows
FROM election_sources es
JOIN election_source_snapshots ess ON ess.source_id = es.id
JOIN election_snapshot_contests esc ON esc.snapshot_id = ess.id
LEFT JOIN election_results_rows rr ON rr.snapshot_contest_id = esc.id
WHERE es.source_key = 'wy|natrona|wy-2026-primary|county_local_summary_official'
GROUP BY es.id, ess.id;

-- Q02: every current Natrona row must come from the one official source.
SELECT
  COUNT(DISTINCT v.contest_key) AS current_contests,
  COUNT(*) AS current_rows,
  COUNT(DISTINCT v.source_id) AS current_sources,
  MIN(v.is_unofficial) AS min_is_unofficial,
  MAX(v.is_unofficial) AS max_is_unofficial,
  COUNT(DISTINCT CASE WHEN v.verification_status = 'verified' THEN v.source_id END)
    AS verified_sources
FROM v_election_current_results v
JOIN election_events ee ON ee.id = v.election_id
WHERE ee.election_key = 'wy-2026-primary'
  AND UPPER(COALESCE(v.county, '')) = 'NATRONA';

-- Q03: acceptance values stated by the official summary and recount.
SELECT
  v.contest_name_normalized,
  v.candidate_name_raw,
  v.votes,
  v.is_unofficial,
  v.verification_status
FROM v_election_current_results v
JOIN election_events ee ON ee.id = v.election_id
WHERE ee.election_key = 'wy-2026-primary'
  AND UPPER(COALESCE(v.county, '')) = 'NATRONA'
  AND (
    (v.contest_name_normalized = 'United States Senator'
      AND UPPER(v.candidate_name_raw) = 'JIMMY SKOVGARD')
    OR
    (v.contest_name_normalized = 'House District 38'
      AND UPPER(v.candidate_name_raw) IN ('ROBERT L. HENDRY', 'JAYME LIEN'))
  )
ORDER BY v.contest_name_normalized, v.votes DESC;

-- Q04: natural-key office coverage for all official committee contests.
WITH committee_contests AS (
  SELECT DISTINCT
    v.contest_key,
    v.contest_name_normalized,
    v.ballot_party,
    CASE
      WHEN v.contest_name_normalized LIKE 'Precinct Committeeman %'
        THEN REPLACE(v.contest_name_normalized, 'Precinct Committeeman ', '')
      WHEN v.contest_name_normalized LIKE 'Precinct Committeewoman %'
        THEN REPLACE(v.contest_name_normalized, 'Precinct Committeewoman ', '')
    END AS precinct_code,
    CASE
      WHEN v.contest_name_normalized LIKE 'Precinct Committeeman %'
        THEN 'Committeeman'
      WHEN v.contest_name_normalized LIKE 'Precinct Committeewoman %'
        THEN 'Committeewoman'
    END AS position_label
  FROM v_election_current_results v
  JOIN election_events ee ON ee.id = v.election_id
  WHERE ee.election_key = 'wy-2026-primary'
    AND UPPER(COALESCE(v.county, '')) = 'NATRONA'
    AND v.reporting_scope = 'precinct'
), natural_matches AS (
  SELECT
    cc.*,
    o.title AS office_title,
    o.seats_available
  FROM committee_contests cc
  LEFT JOIN offices o
    ON o.county = 'Natrona'
   AND o.scope_kind = 'precinct_party_gender'
   AND o.precinct_code = cc.precinct_code
   AND o.title = (
     'Natrona Precinct ' || cc.precinct_code || ' '
     || CASE cc.ballot_party WHEN 'REP' THEN 'Republican' WHEN 'DEM' THEN 'Democratic' END
     || ' Precinct ' || cc.position_label
   )
)
SELECT
  COUNT(*) AS official_committee_contests,
  SUM(office_title IS NOT NULL) AS exact_natural_key_offices,
  SUM(office_title IS NULL) AS missing_offices
FROM natural_matches;

-- Q05: corrected values for the 98 represented committee offices.
SELECT
  COUNT(*) AS represented_offices,
  SUM(seats_available) AS represented_seats,
  SUM(seats_available > 1) AS multi_seat_offices,
  MAX(seats_available) AS maximum_seats
FROM offices
WHERE county = 'Natrona'
  AND scope_kind = 'precinct_party_gender';

-- Q06: both official Republican precinct 3-10 contests are Vote For 8.
SELECT
  title,
  seats_available,
  CASE WHEN seats_available = 8 THEN 'pass' ELSE 'fail' END AS expected_eight
FROM offices
WHERE county = 'Natrona'
  AND scope_kind = 'precinct_party_gender'
  AND precinct_code = '3-10'
  AND title IN (
    'Natrona Precinct 3-10 Republican Precinct Committeeman',
    'Natrona Precinct 3-10 Republican Precinct Committeewoman'
  )
ORDER BY title;

-- Q07: historical unofficial sources must remain while the official source wins.
SELECT
  es.source_key,
  es.source_role,
  ess.is_unofficial,
  ess.verification_status,
  COUNT(DISTINCT esc.contest_id) AS contests,
  COUNT(rr.id) AS result_rows
FROM election_sources es
JOIN election_source_snapshots ess ON ess.source_id = es.id
JOIN election_snapshot_contests esc ON esc.snapshot_id = ess.id
LEFT JOIN election_results_rows rr ON rr.snapshot_contest_id = esc.id
JOIN election_events ee ON ee.id = es.election_id
WHERE ee.election_key = 'wy-2026-primary'
  AND es.county = 'Natrona'
GROUP BY es.id, ess.id
ORDER BY ess.is_unofficial, es.source_key;

-- Q08: current-result identities must be unique.
SELECT COUNT(*) AS duplicate_current_identities
FROM (
  SELECT
    v.contest_key,
    v.row_type,
    UPPER(COALESCE(v.candidate_name_raw, v.row_type)) AS result_identity,
    COUNT(*) AS identity_count
  FROM v_election_current_results v
  JOIN election_events ee ON ee.id = v.election_id
  WHERE ee.election_key = 'wy-2026-primary'
    AND UPPER(COALESCE(v.county, '')) = 'NATRONA'
  GROUP BY v.contest_key, v.row_type, result_identity
  HAVING identity_count > 1
);

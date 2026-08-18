-- Candidates/db/migrations/0030_election_source_precedence.sql
--
-- Additive fix, no table changes. Real bug found during the first full
-- 2024 test with two independent sources loaded for the same county:
-- v_election_current_results (0029) filters to the latest snapshot PER
-- SOURCE, but does nothing when two DIFFERENT sources both report the
-- same (contest, county), e.g. Albany's US Senate race exists in both
-- the SOS xlsx_wide_header track (county_pbp_summary) and the
-- county-hosted PDF track (county_local_summary). Confirmed by direct
-- query: Albany's John Barrasso appeared twice in the aggregate view,
-- 2563 votes from each source (the numbers agree exactly, good
-- cross-source validation, but summing both would double-count).
--
-- Precedence decision made now, not deferred: county_local_summary wins
-- over county_pbp_summary for any (contest, county) pair where it
-- actually has data, because it's the county's own authoritative
-- self-report and the only source with county/local contests at all.
-- Precedence is resolved PER (contest, county), not per county globally.
-- If the county-hosted parse failed to reconcile a specific contest (5 of
-- Albany's 63 contests, see tests/fixtures/elections/ findings), that
-- specific contest still correctly falls back to the SOS source rather
-- than losing coverage entirely. This is a real, explicit design decision,
-- not a default that happened to fall out of the schema, flag for human
-- review if a different precedence is wanted later (e.g. always prefer
-- the state archive for federal/legislative races specifically).

CREATE VIEW IF NOT EXISTS v_election_contest_county_sources AS
SELECT DISTINCT
  sc.contest_id,
  esrc.county,
  esrc.id AS source_id,
  CASE esrc.source_role
    WHEN 'county_local_summary' THEN 1
    WHEN 'county_pbp_summary' THEN 2
    ELSE 3
  END AS priority
FROM election_snapshot_contests sc
JOIN election_source_snapshots ess   ON ess.id = sc.snapshot_id
JOIN v_election_latest_snapshots vls ON vls.snapshot_id = ess.id
JOIN election_sources esrc           ON esrc.id = ess.source_id
WHERE esrc.county IS NOT NULL;

CREATE VIEW IF NOT EXISTS v_election_winning_source_per_contest_county AS
SELECT contest_id, county, source_id
FROM (
  SELECT contest_id, county, source_id,
         ROW_NUMBER() OVER (PARTITION BY contest_id, county ORDER BY priority) AS rn
  FROM v_election_contest_county_sources
)
WHERE rn = 1;

DROP VIEW IF EXISTS v_election_current_results;

CREATE VIEW v_election_current_results AS
SELECT
  ec.election_id,
  ec.id                    AS contest_id,
  ec.contest_key,
  ec.contest_name_normalized,
  ec.level,
  ec.district,
  ec.ballot_party,
  ec.reporting_scope,
  esrc.county,
  esrc.id                  AS source_id,
  esrc.source_role,
  esrc.endpoint_url        AS source_url,
  esc.id                   AS snapshot_contest_id,
  esc.precincts_reporting,
  esc.precincts_total,
  esc.reporting_status,
  ess.is_unofficial,
  ess.verification_status,
  ess.retrieved_at,
  ess.source_published_at,
  rr.id                    AS result_row_id,
  rr.row_type,
  rr.reporting_county,
  rr.precinct_code,
  rr.candidate_name_raw,
  rr.candidate_id,
  rr.votes,
  rr.percentage_reported
FROM election_results_rows rr
JOIN election_snapshot_contests esc  ON esc.id = rr.snapshot_contest_id
JOIN election_source_snapshots ess   ON ess.id = esc.snapshot_id
JOIN v_election_latest_snapshots vls ON vls.snapshot_id = ess.id
JOIN election_sources esrc           ON esrc.id = ess.source_id
JOIN election_contests ec            ON ec.id = esc.contest_id
JOIN v_election_winning_source_per_contest_county w
  ON w.contest_id = ec.id AND w.county = esrc.county AND w.source_id = esrc.id;

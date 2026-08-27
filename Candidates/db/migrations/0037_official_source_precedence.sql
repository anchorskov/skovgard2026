-- Candidates/db/migrations/0037_official_source_precedence.sql
--
-- Makes county-source selection deterministic when an official result
-- publication and an earlier unofficial publication have the same source
-- role and report the same contest. The existing priority remains unchanged:
-- county local summary, then county precinct-by-precinct summary, then other
-- sources. Within one priority, an official verified snapshot wins over an
-- unofficial verified snapshot. Publication time, retrieval time, and source
-- id provide deterministic succession among sources with the same status.
--
-- Result facts remain append-only. This migration changes views only.

DROP VIEW IF EXISTS v_election_current_results;
DROP VIEW IF EXISTS v_election_selected_snapshot_contests;
DROP VIEW IF EXISTS v_election_winning_source_per_contest_county;
DROP VIEW IF EXISTS v_election_contest_county_sources;

CREATE VIEW v_election_contest_county_sources AS
SELECT DISTINCT
  sc.contest_id,
  esrc.county,
  esrc.id AS source_id,
  CASE esrc.source_role
    WHEN 'county_local_summary' THEN 1
    WHEN 'county_pbp_summary' THEN 2
    ELSE 3
  END AS priority,
  ess.is_unofficial,
  ess.source_published_at,
  ess.retrieved_at
FROM election_snapshot_contests sc
JOIN election_source_snapshots ess   ON ess.id = sc.snapshot_id
JOIN v_election_latest_snapshots vls ON vls.snapshot_id = ess.id
JOIN election_sources esrc           ON esrc.id = ess.source_id
WHERE esrc.county IS NOT NULL;

CREATE VIEW v_election_winning_source_per_contest_county AS
SELECT contest_id, county, source_id
FROM (
  SELECT
    contest_id,
    county,
    source_id,
    ROW_NUMBER() OVER (
      PARTITION BY contest_id, county
      ORDER BY
        priority,
        is_unofficial,
        datetime(COALESCE(source_published_at, retrieved_at)) DESC,
        datetime(retrieved_at) DESC,
        source_id DESC
    ) AS rn
  FROM v_election_contest_county_sources
)
WHERE rn = 1;

CREATE VIEW v_election_selected_snapshot_contests AS
SELECT
  ec.id                    AS contest_id,
  ec.election_id,
  esrc.county,
  esc.id                   AS snapshot_contest_id,
  esc.precincts_reporting,
  esc.precincts_total,
  esc.reporting_status,
  esc.source_contest_name_raw,
  esc.source_district_raw,
  esc.source_ballot_party_raw,
  ess.is_unofficial,
  ess.verification_status,
  ess.retrieved_at,
  ess.source_published_at,
  esrc.id                  AS source_id,
  esrc.source_role,
  esrc.endpoint_url        AS source_url
FROM election_snapshot_contests esc
JOIN election_source_snapshots ess   ON ess.id = esc.snapshot_id
JOIN v_election_latest_snapshots vls ON vls.snapshot_id = ess.id
JOIN election_sources esrc           ON esrc.id = ess.source_id
JOIN election_contests ec            ON ec.id = esc.contest_id
JOIN v_election_winning_source_per_contest_county w
  ON w.contest_id = ec.id AND w.county = esrc.county AND w.source_id = esrc.id;

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
  rr.candidate_id_guess,
  rr.candidate_match_status,
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

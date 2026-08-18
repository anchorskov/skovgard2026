-- Candidates/db/migrations/0029_election_results_views.sql
--
-- Additive expansion to 0028_election_results.sql, no table changes.
--
-- Gap this closes: nothing in 0028 picks "the latest snapshot" when a
-- source is polled repeatedly. Invisible today (one snapshot per county,
-- all certified 2024 data), but the instant a source gets a second
-- snapshot, exactly what happens on live election night, any query
-- that doesn't filter to the latest snapshot per source would double-count
-- votes across snapshots. This is a view, not a redesign: it composes the
-- existing UNIQUE(source_id, sha256) + snapshot_seq columns already in
-- 0028, nothing new is stored.

CREATE VIEW IF NOT EXISTS v_election_latest_snapshots AS
SELECT s.id AS snapshot_id, s.source_id, s.snapshot_seq
FROM election_source_snapshots s
WHERE s.snapshot_seq = (
  SELECT MAX(s2.snapshot_seq)
  FROM election_source_snapshots s2
  WHERE s2.source_id = s.source_id
);

-- One row per result row, joined all the way up to its contest/election,
-- filtered to only the latest snapshot per source. This is the view both
-- the /results index and /results/contest/[id] pages read from, any page
-- that needs "current" results should read this view, never
-- election_results_rows directly, so the latest-snapshot filter can never
-- be silently forgotten on a new query.
CREATE VIEW IF NOT EXISTS v_election_current_results AS
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
JOIN election_contests ec            ON ec.id = esc.contest_id;

-- Candidates/db/migrations/0031_election_results_integrity.sql
--
-- Additive integrity migration. No table is dropped or rebuilt; no
-- existing row is deleted or edited. Fixes three real defects found
-- during a follow-up review, each confirmed against the live local
-- database before being fixed here, not assumed from theory:
--
-- 1. v_election_latest_snapshots (0029) picked the highest snapshot_seq
--    per source with no regard for verification_status. A newer
--    parse_failed or needs_review snapshot would have silently replaced
--    a good verified one the moment such a snapshot exists. All 25
--    snapshots currently in the local database are already
--    verification_status='verified', so this redefinition is a no-op
--    against existing data and only changes behavior for future
--    ingestion, confirmed by direct query before writing this file.
--
-- 2. The results pages summed precincts_reporting/precincts_total by
--    doing SUM() over v_election_current_results, which has one row per
--    CANDIDATE/writein/overvote/undervote. A contest with 6 result rows
--    per county (3 candidates + writein + overvote + undervote, all
--    stamped with the same contest-level precinct counts) multiplied the
--    true count by 6. Confirmed empirically: a single contest's true
--    precinct total was inflated by roughly 4x through this bug.
--    v_election_selected_snapshot_contests (new) gives exactly one row
--    per (contest, county), the correct grain for this aggregation.
--    A page can SUM() over it directly with no multiplication.
--
-- 3. election_contests.contest_name_raw is a single column on the
--    canonical contest row, so only the FIRST source to create a given
--    contest_key keeps its raw text; a second, later source reporting
--    the same canonical contest under different wording had nowhere to
--    record its own raw label. Fixed by adding source-specific label
--    columns to election_snapshot_contests, which already IS the correct
--    grain (one row per contest as it appeared in one specific
--    snapshot/source), not a new table, since one already existed at
--    exactly the right cardinality.
--
-- Why an additive migration rather than editing 0028/0029 directly:
-- localhost already has 15,897 seeded result rows built on top of the
-- view definitions in 0029. Editing 0029 in place would work for a clean
-- install but silently do nothing for this already-migrated database
-- (CREATE VIEW IF NOT EXISTS is a no-op if the view already exists under
-- the old definition). A new migration file is the only way to actually
-- change behavior on a database that already ran 0029, while a clean
-- install run from 0028+0029+0031 in order produces the identical end
-- state, verified separately against a fresh in-memory schema before
-- this file was applied here.

-- election_snapshot_contests: source-specific contest identity, additive
-- columns only. NULL for all 518 existing rows until Stage 2 is updated
-- to populate them for future ingestion, documented gap, not fabricated.
ALTER TABLE election_snapshot_contests ADD COLUMN source_contest_name_raw TEXT;
ALTER TABLE election_snapshot_contests ADD COLUMN source_contest_name_normalized TEXT;
ALTER TABLE election_snapshot_contests ADD COLUMN source_external_contest_id TEXT;
ALTER TABLE election_snapshot_contests ADD COLUMN source_district_raw TEXT;
ALTER TABLE election_snapshot_contests ADD COLUMN source_ballot_party_raw TEXT;
ALTER TABLE election_snapshot_contests ADD COLUMN source_normalization_warnings TEXT;

-- Integrity guards as triggers, not CHECK constraints: SQLite has no
-- ALTER TABLE ADD CONSTRAINT. Adding a CHECK to an existing table
-- requires rebuilding it (create-copy-drop-rename), which is unnecessary
-- risk against a database already holding real data for a migration that
-- only needs to affect FUTURE inserts. Triggers enforce the identical
-- invariants for every insert from this point forward without touching
-- existing rows or table structure.
CREATE TRIGGER IF NOT EXISTS trg_election_source_snapshots_seq_positive
BEFORE INSERT ON election_source_snapshots
WHEN NEW.snapshot_seq <= 0
BEGIN
  SELECT RAISE(ABORT, 'election_source_snapshots.snapshot_seq must be > 0');
END;

CREATE TRIGGER IF NOT EXISTS trg_election_source_snapshots_unofficial_bool
BEFORE INSERT ON election_source_snapshots
WHEN NEW.is_unofficial NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'election_source_snapshots.is_unofficial must be 0 or 1');
END;

CREATE TRIGGER IF NOT EXISTS trg_election_snapshot_contests_precincts_nonneg
BEFORE INSERT ON election_snapshot_contests
WHEN (NEW.precincts_reporting IS NOT NULL AND NEW.precincts_reporting < 0)
  OR (NEW.precincts_total IS NOT NULL AND NEW.precincts_total < 0)
BEGIN
  SELECT RAISE(ABORT, 'precincts_reporting/precincts_total must be nonnegative');
END;

CREATE TRIGGER IF NOT EXISTS trg_election_snapshot_contests_precincts_bound
BEFORE INSERT ON election_snapshot_contests
WHEN NEW.precincts_reporting IS NOT NULL AND NEW.precincts_total IS NOT NULL
  AND NEW.precincts_reporting > NEW.precincts_total
BEGIN
  SELECT RAISE(ABORT, 'precincts_reporting cannot exceed precincts_total');
END;

CREATE TRIGGER IF NOT EXISTS trg_election_snapshot_contests_total_nonneg
BEFORE INSERT ON election_snapshot_contests
WHEN NEW.contest_total_votes IS NOT NULL AND NEW.contest_total_votes < 0
BEGIN
  SELECT RAISE(ABORT, 'contest_total_votes must be nonnegative');
END;

CREATE TRIGGER IF NOT EXISTS trg_election_source_checks_content_length_nonneg
BEFORE INSERT ON election_source_checks
WHEN NEW.content_length IS NOT NULL AND NEW.content_length < 0
BEGIN
  SELECT RAISE(ABORT, 'election_source_checks.content_length must be nonnegative');
END;

-- UNIQUE(source_id, sha256) alone does not stop two concurrent ingestion
-- runs from picking the same snapshot_seq for two genuinely different
-- artifacts (e.g. a corrected file with different content but computed
-- before the first insert's seq was visible). Enforce the pair directly.
CREATE UNIQUE INDEX IF NOT EXISTS uq_election_source_snapshots_source_seq
  ON election_source_snapshots(source_id, snapshot_seq);

-- --- Fix 1: latest ACCEPTED (verified) snapshot per source, not just
-- highest snapshot_seq. A newer parse_failed/needs_review snapshot is
-- correctly ignored here; it exists in election_source_snapshots as
-- evidence but never becomes "current" until something marks it verified.
DROP VIEW IF EXISTS v_election_current_results;
DROP VIEW IF EXISTS v_election_selected_snapshot_contests;
DROP VIEW IF EXISTS v_election_winning_source_per_contest_county;
DROP VIEW IF EXISTS v_election_contest_county_sources;
DROP VIEW IF EXISTS v_election_latest_snapshots;

CREATE VIEW v_election_latest_snapshots AS
SELECT s.id AS snapshot_id, s.source_id, s.snapshot_seq
FROM election_source_snapshots s
WHERE s.verification_status = 'verified'
  AND s.snapshot_seq = (
    SELECT MAX(s2.snapshot_seq)
    FROM election_source_snapshots s2
    WHERE s2.source_id = s.source_id
      AND s2.verification_status = 'verified'
  );

-- --- Fix 3 (precedence, unchanged logic from 0030, now built on the
-- verified-only latest-snapshot view above so an unaccepted snapshot can
-- never win a precedence contest either).
CREATE VIEW v_election_contest_county_sources AS
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

CREATE VIEW v_election_winning_source_per_contest_county AS
SELECT contest_id, county, source_id
FROM (
  SELECT contest_id, county, source_id,
         ROW_NUMBER() OVER (PARTITION BY contest_id, county ORDER BY priority) AS rn
  FROM v_election_contest_county_sources
)
WHERE rn = 1;

-- --- Fix 2: one row per (contest, county), the correct grain for
-- precinct-count aggregation. A page must SUM() this view, grouped by
-- contest_id, to get a correct total, never SUM() over
-- v_election_current_results, which is at the result-row grain and will
-- multiply by however many candidate/writein/overvote/undervote rows
-- exist per county.
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

-- --- Result-row grain, rebuilt on the verified-only latest-snapshot
-- view and the same precedence join as before (logic unchanged from
-- 0030 other than inheriting the verified-only fix transitively).
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

-- Candidates/db/migrations/0028_election_results.sql
--
-- Election-results schema: normalized, append-only ingestion of official
-- Wyoming county/SOS results, joined to the existing offices/candidates
-- tables without duplicating them. Reviewed against a Codex-generated
-- schema critique before being written (see conversation history).
-- Every table shape below reflects a specific finding from that review,
-- cross-checked against real 2024 official data for Natrona, Big Horn,
-- Fremont, Laramie, and Campbell counties (Candidates/tests/fixtures/elections/).
--
-- Decisions made explicitly before writing this file:
--   - Lives in the shared `wy` database, not a dedicated results DB. D1 has
--     no cross-database join from a Worker, so office_id/candidate_id FKs
--     would become nominal-only in a split database, not worth it here.
--     The results-polling job must run in a separate scheduled Worker
--     (like skovgard-candidates-cron), never inline in a request handler,
--     so a slow/bursty ingestion burst can never block a live page load.
--   - Raw artifact bytes (HTML/CSV/XLSX/PDF) are NOT stored here.
--     raw_artifact_ref is a nullable, format-unspecified pointer for later.
--     No R2 binding exists in Candidates/wrangler.toml today, and adding one
--     is a separate design/deploy decision, not bundled into this migration.
--   - Append-only forever. No purge job will ever run against these tables
--     (unlike ballot_saves' 1-day post-election purge), this is the
--     historical record, not session-scoped voter convenience data.
--   - No ON DELETE CASCADE anywhere. A delete should never happen in normal
--     operation; cascade behavior would let one accidental delete silently
--     erase history transitively through the whole chain.
--
-- WORM note: election_sources rows are themselves append-only. A source's
-- URL/status changing is recorded as a NEW row with supersedes_source_id
-- pointing at the old one, never an UPDATE in place. Same principle
-- applies throughout: corrections are new rows, never edits.

CREATE TABLE IF NOT EXISTS election_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  election_key    TEXT NOT NULL UNIQUE,       -- 'wy-2026-primary', 'wy-2024-primary'
  election_name   TEXT NOT NULL,
  election_phase  TEXT NOT NULL CHECK (election_phase IN ('primary','general','special')),
  election_date   TEXT NOT NULL,              -- ISO-8601 date
  polls_close_at  TEXT NOT NULL,              -- ISO-8601 timestamp, e.g. 2026-08-18T19:00:00-06:00
  state           TEXT NOT NULL DEFAULT 'WY',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Source registry: one row per distinct endpoint (landing page, PDF,
-- XLSX-in-ZIP, ballots-cast sheet, vendor API, manual). A county has many
-- of these, not one, see the real Natrona/Laramie/Campbell fixture data,
-- which each have 3-4 distinct official endpoints.
CREATE TABLE IF NOT EXISTS election_sources (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key            TEXT NOT NULL UNIQUE,  -- deterministic: wy|<county-or-statewide>|<election_key>|<source_role>
  election_id           INTEGER NOT NULL REFERENCES election_events(id),
  county                TEXT,                  -- NULL for statewide-only endpoints (e.g. the SOS ZIP)
  county_fips           TEXT,
  source_role           TEXT NOT NULL,         -- 'landing_page' | 'county_pbp_summary' | 'county_pbp_detail' | 'ballots_cast' | 'sos_official_archive' | 'vendor_unofficial' | 'manual'
  source_type           TEXT,                  -- 'xlsx_wide_header' | 'csv' | 'html_table' | 'pdf_text' | 'vendor_api' | 'manual'
  landing_page_url      TEXT,
  endpoint_url           TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','active','manual_only','disabled')),
  notes                    TEXT,
  supersedes_source_id     INTEGER REFERENCES election_sources(id),
  created_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Append-only: one row per poll attempt, whether or not it produced new data.
-- An identical repeated download (same sha256) writes only here, it never
-- creates a new snapshot. This is the fix for "polling every 60-120s all
-- night must not create thousands of duplicate snapshots."
CREATE TABLE IF NOT EXISTS election_source_checks (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id                INTEGER NOT NULL REFERENCES election_sources(id),
  checked_at                TEXT NOT NULL DEFAULT (datetime('now')),
  http_status                INTEGER CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  redirect_to                 TEXT,
  content_type                 TEXT,
  content_length                 INTEGER,
  etag                            TEXT,
  last_modified                    TEXT,
  sha256                            TEXT,
  test_data_screen_result            TEXT NOT NULL DEFAULT 'unknown'
                                        CHECK (test_data_screen_result IN ('clean','rejected_test_data','rejected_sample_ballot','unknown')),
  error_message                        TEXT,
  resulted_in_snapshot_id                INTEGER REFERENCES election_source_snapshots(id)
);

-- Append-only: one row per meaningfully-new artifact (new sha256 for a
-- source). A correction is a new row with a later retrieved_at/higher
-- snapshot_seq, nothing is ever destroyed or overwritten.
CREATE TABLE IF NOT EXISTS election_source_snapshots (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id              INTEGER NOT NULL REFERENCES election_sources(id),
  snapshot_seq           INTEGER NOT NULL,       -- monotonic per source_id
  sha256                 TEXT NOT NULL,
  retrieved_at           TEXT NOT NULL DEFAULT (datetime('now')),
  source_published_at    TEXT,
  raw_artifact_ref        TEXT,                  -- unresolved, see header note on R2
  parser_name              TEXT NOT NULL,
  parser_version            TEXT,
  is_unofficial              INTEGER NOT NULL DEFAULT 1,
  verification_status         TEXT NOT NULL DEFAULT 'unverified'
                                 CHECK (verification_status IN ('unverified','verified','needs_review','parse_failed')),
  warning_message                TEXT,
  UNIQUE (source_id, sha256)
);

-- Canonical contests. Exists ONCE per contest, regardless of how many
-- counties report a subtotal for it, a statewide U.S. Senate contest is
-- one row here, not 23. `county` is only set when the contest itself is
-- county-owned (reporting_scope IN ('county','city')); for a statewide
-- contest, which county reported which subtotal is a property of the
-- RESULT ROW (election_results_rows.reporting_county), not of the contest.
CREATE TABLE IF NOT EXISTS election_contests (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_key                 TEXT NOT NULL UNIQUE,
  election_id                  INTEGER NOT NULL REFERENCES election_events(id),
  contest_name_raw              TEXT NOT NULL,    -- verbatim, incl. ", Continued" if the source printed it
  contest_name_normalized        TEXT NOT NULL,
  level                            TEXT NOT NULL,  -- reuses offices.level vocabulary: federal|statewide|wy_senate|wy_house|county|city
  district                          INTEGER,
  ballot_party                       TEXT,         -- REP | DEM | LIB | NP
  ballot_party_raw                    TEXT,        -- as printed by source, e.g. "Republican"
  reporting_scope                      TEXT NOT NULL
                                          CHECK (reporting_scope IN ('statewide','legislative_district','county','city','precinct')),
  county                                 TEXT,      -- only set when reporting_scope IN ('county','city')
  external_contest_id                     TEXT,
  office_id                                INTEGER REFERENCES offices(id),        -- confirmed only
  office_id_guess                           INTEGER REFERENCES offices(id),       -- best guess, never read by the live app
  office_match_status                        TEXT NOT NULL DEFAULT 'not_attempted'
                                                CHECK (office_match_status IN ('not_attempted','exact','ambiguous','no_office_found')),
  office_match_notes                           TEXT,
  office_match_reviewed_at                       TEXT,
  normalization_warnings                          TEXT,
  created_at                                       TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (reporting_scope NOT IN ('county','city') OR county IS NOT NULL)
);

-- Junction: one row per (snapshot, contest) pair actually present in that
-- snapshot. This is where precincts_reporting/precincts_total/reporting_status
-- live, once per snapshot per contest, not repeated on every candidate row.
CREATE TABLE IF NOT EXISTS election_snapshot_contests (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id          INTEGER NOT NULL REFERENCES election_source_snapshots(id),
  contest_id           INTEGER NOT NULL REFERENCES election_contests(id),
  precincts_reporting  INTEGER,
  precincts_total      INTEGER,
  reporting_status     TEXT NOT NULL DEFAULT 'waiting'
                          CHECK (reporting_status IN ('waiting','partial','county_complete','stale','source_unavailable','manual_required','certified')),
  contest_total_votes  INTEGER,          -- source-reported total, when the source provides one
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (snapshot_id, contest_id)
);

-- The actual vote rows. row_type distinguishes real candidates from
-- write-in/overvote/undervote ballot categories, those must never be
-- alias-matched against candidates.id. precinct_code IS NULL means this row
-- is a county-level (or statewide-level, if reporting_county is also NULL)
-- rollup, not a real precinct's numbers, confirmed against the official
-- "Total" row in every 2024 fixture county, which reconciles exactly.
CREATE TABLE IF NOT EXISTS election_results_rows (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  result_row_key         TEXT NOT NULL UNIQUE,
  snapshot_contest_id     INTEGER NOT NULL REFERENCES election_snapshot_contests(id),
  row_type                 TEXT NOT NULL
                              CHECK (row_type IN ('candidate','write_in_named','write_in_aggregate','overvote','undervote','blank','total')),
  reporting_county           TEXT,       -- the county this row's numbers came from (NULL = statewide rollup row)
  precinct_code                TEXT,     -- NULL = county/contest-level rollup row, not a real precinct
  precinct_name_raw              TEXT,
  candidate_name_raw               TEXT,
  candidate_name_normalized          TEXT,
  external_candidate_id                TEXT,
  candidate_id                           INTEGER REFERENCES candidates(id),       -- confirmed only
  candidate_id_guess                      INTEGER REFERENCES candidates(id),      -- best guess, never read by the live app
  candidate_match_status                    TEXT NOT NULL DEFAULT 'not_attempted'
                                                CHECK (candidate_match_status IN ('not_attempted','exact','ambiguous','no_candidate_found')),
  candidate_match_notes                        TEXT,
  votes                                          INTEGER NOT NULL CHECK (votes >= 0),
  percentage_reported                              REAL,  -- verbatim from source, never app-calculated
  created_at                                         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reusable candidate-name aliases, scoped per source: the same county PDF
-- prints the same mangled name ("JohnBarrasso") on every snapshot, so a
-- human-reviewed alias should apply automatically to every later poll
-- instead of being re-fuzzed each time.
CREATE TABLE IF NOT EXISTS election_candidate_aliases (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id            INTEGER NOT NULL REFERENCES election_sources(id),
  raw_name_normalized  TEXT NOT NULL,
  candidate_id         INTEGER NOT NULL REFERENCES candidates(id),
  confidence           TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_id, raw_name_normalized)
);

CREATE INDEX IF NOT EXISTS idx_election_sources_election         ON election_sources(election_id);
CREATE INDEX IF NOT EXISTS idx_election_sources_county            ON election_sources(county);
CREATE INDEX IF NOT EXISTS idx_election_source_checks_source      ON election_source_checks(source_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_election_source_snapshots_source   ON election_source_snapshots(source_id, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_election_snapshot_contests_contest ON election_snapshot_contests(contest_id);
CREATE INDEX IF NOT EXISTS idx_election_contests_election         ON election_contests(election_id);
CREATE INDEX IF NOT EXISTS idx_election_contests_office           ON election_contests(office_id);
CREATE INDEX IF NOT EXISTS idx_election_results_rows_snapshot_c   ON election_results_rows(snapshot_contest_id);
CREATE INDEX IF NOT EXISTS idx_election_results_rows_candidate    ON election_results_rows(candidate_id);
CREATE INDEX IF NOT EXISTS idx_election_results_rows_precinct     ON election_results_rows(precinct_code);
CREATE INDEX IF NOT EXISTS idx_election_results_rows_reporting_c  ON election_results_rows(reporting_county);
CREATE INDEX IF NOT EXISTS idx_election_contests_review_queue     ON election_contests(office_match_status) WHERE office_match_status != 'exact';
CREATE INDEX IF NOT EXISTS idx_election_results_review_queue      ON election_results_rows(candidate_match_status) WHERE candidate_match_status != 'exact';

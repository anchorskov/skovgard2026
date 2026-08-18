-- Candidates/db/migrations/0032_election_source_discoveries.sql
-- Append-only link discoveries produced by the standalone Results Worker.
-- A discovery is evidence for human review, not an approved result source and
-- never permission to publish vote totals.

CREATE TABLE IF NOT EXISTS election_source_discoveries (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id             INTEGER NOT NULL REFERENCES election_source_checks(id),
  source_id            INTEGER NOT NULL REFERENCES election_sources(id),
  discovered_url       TEXT NOT NULL,
  link_text            TEXT,
  classification       TEXT NOT NULL
                         CHECK (classification IN (
                           'candidate_result',
                           'result_other_year_or_unknown',
                           'rejected_test_data',
                           'rejected_sample_ballot'
                         )),
  discovery_reason     TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (check_id, discovered_url)
);

CREATE INDEX IF NOT EXISTS idx_election_source_discoveries_source
  ON election_source_discoveries(source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_election_source_discoveries_classification
  ON election_source_discoveries(classification, created_at DESC);

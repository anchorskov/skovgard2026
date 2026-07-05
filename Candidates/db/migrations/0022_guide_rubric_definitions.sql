-- Versioned, database-backed rubric definitions.
-- Canonical authoring source: Candidates/data/rubrics/wy-primary-2026-v1.md

CREATE TABLE IF NOT EXISTS guide_rubric_versions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  rubric_key      TEXT    NOT NULL UNIQUE,
  title           TEXT    NOT NULL,
  election_cycle  TEXT    NOT NULL,
  score_min       INTEGER NOT NULL CHECK (score_min = 0),
  score_max       INTEGER NOT NULL CHECK (score_max = 5),
  unknown_policy  TEXT    NOT NULL CHECK (unknown_policy IN ('excluded')),
  status          TEXT    NOT NULL CHECK (status IN ('draft','active','retired')),
  source_sha256   TEXT    NOT NULL,
  activated_at    TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_guide_rubric_active_cycle
  ON guide_rubric_versions(election_cycle)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS guide_rubric_categories (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  rubric_version_id   INTEGER NOT NULL REFERENCES guide_rubric_versions(id),
  category_key        TEXT    NOT NULL,
  label               TEXT    NOT NULL,
  description         TEXT    NOT NULL,
  evidence_guidance   TEXT    NOT NULL,
  weight              INTEGER NOT NULL CHECK (weight > 0),
  display_order       INTEGER NOT NULL,
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (rubric_version_id, category_key),
  UNIQUE (rubric_version_id, display_order)
);

CREATE INDEX IF NOT EXISTS idx_guide_rubric_categories_version
  ON guide_rubric_categories(rubric_version_id, active, display_order);

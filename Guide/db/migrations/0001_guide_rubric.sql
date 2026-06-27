-- Candidates/db/migrations/0012_guide_rubric.sql
-- Rubric scoring tables for guide.skovgard2026.org candidate evaluations.
-- One row per candidate per rubric category.

CREATE TABLE IF NOT EXISTS guide_rubric_scores (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id          INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  category_key          TEXT    NOT NULL,  -- 'constitutional_oath' | 'character' | 'competence' | 'accountability' | 'fiscal' | 'local_impact' | 'public_service' | 'issue_alignment' | 'coalition' | 'evidence_quality'
  category_label        TEXT    NOT NULL,
  weight                INTEGER NOT NULL,  -- matches rubric: 15,15,10,10,10,10,10,10,5,5

  -- Score fields: NULL = unknown (not scored), not zero
  score_original        REAL,
  score_revised         REAL,
  score_revised_at      TEXT,             -- ISO-8601 datetime of revision
  score_revised_reason  TEXT,             -- why it was changed, shown publicly

  -- Evidence
  evidence_notes        TEXT,             -- summary of what evidence was found
  follow_up_question    TEXT,             -- open question sent to candidate
  evidence_confidence   TEXT DEFAULT 'Low' CHECK (evidence_confidence IN ('High','Medium','Low')),

  -- Attribution
  scored_by             TEXT    NOT NULL DEFAULT 'jimmy@grassrootsmvt.org',
  scored_at             TEXT    NOT NULL DEFAULT (datetime('now')),

  created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT    NOT NULL DEFAULT (datetime('now')),

  UNIQUE (candidate_id, category_key)
);

CREATE INDEX IF NOT EXISTS idx_guide_rubric_candidate
  ON guide_rubric_scores(candidate_id);

-- guide_sources: numbered citation list per candidate, referenced in evidence_notes
CREATE TABLE IF NOT EXISTS guide_sources (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id    INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  source_number   INTEGER NOT NULL,  -- sequential per candidate (1, 2, 3…)
  source_name     TEXT    NOT NULL,
  source_url      TEXT,
  source_date     TEXT,              -- date accessed or publication date (ISO-8601)
  evidence_weight INTEGER NOT NULL DEFAULT 3 CHECK (evidence_weight BETWEEN 0 AND 5),
  notes           TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),

  UNIQUE (candidate_id, source_number)
);

CREATE INDEX IF NOT EXISTS idx_guide_sources_candidate
  ON guide_sources(candidate_id);
